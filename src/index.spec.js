/* eslint-disable */
require('should');
var Limiter = require('./limiter').default;

// Uncomment the following line if you want to see
// debug logs from the node-redis module.
//redis.debug_mode = true;

['redis', 'ioredis'].forEach(function (redisModuleName) {
  var redisModule = require(redisModuleName);
  var db = require(redisModuleName).createClient();
  describe('Limiter with ' + redisModuleName, function() {
    beforeEach(function(done) {
      db.keys('limit:*', function(err, keys) {
        if (err) return done(err);
        if (!keys.length) return done();
        var args = keys.concat(done);
        db.del.apply(db, args);
      });
    });

    describe('.total', function() {
      it('should represent the total limit per reset period', function(done) {
        var limit = new Limiter({
          max: 5,
          id: 'something',
          db,
        });
        limit.newHit(function(err, res) {
          res.total.should.equal(5);
          done();
        });
      });
    });

    describe('.remaining', function() {
      it('should represent the number of requests remaining in the reset period', function(done) {
        var limit = new Limiter({
          max: 5,
          duration: 100000,
          id: 'something',
          db: db
        });
        limit.newHit(function(err, res) {
          try {
            res.remaining.should.equal(5);
          } catch(err) {
            done(err);
          }
          limit.newHit(function(err, res) {
            try {
              res.remaining.should.equal(4);
            } catch(err) {
              done(err);
            }

            limit.newHit(function(err, res) {
              try {
                res.remaining.should.equal(3);
              } catch(err) {
                done(err);
              }

              done();
            });
          });
        });
      });
    });

    describe('.reset', function() {
      it('should represent the next reset time in UTC epoch seconds', function(done) {
        var limit = new Limiter({
          max: 5,
          duration: 60000,
          id: 'something',
          db: db
        });
        limit.newHit(function(err, res) {
          var left = res.reset - (Date.now() / 1000);
          left.should.be.below(60);
          done();
        });
      });
    });

    describe('when the limit is exceeded', function() {
      it('should retain .remaining at 0', function(done) {
        var limit = new Limiter({
          max: 2,
          id: 'something',
          db: db
        });
        limit.newHit(function(err, res) {
          try {
            res.remaining.should.equal(2);
          } catch(err) {
            done(err);
          }

          limit.newHit(function(err, res) {
            try {
              res.remaining.should.equal(1);
            } catch(err) {
              done(err);
            }

            limit.newHit(function(err, res) {
              // function caller should reject this call
              try {
                res.remaining.should.equal(0);
              } catch(err) {
                done(err);
              }

              done();
            });
          });
        });
      });
    });

    describe('when the duration is exceeded', function() {
      it('should reset', function(done) {
        this.timeout(5000);
        var limit = new Limiter({
          duration: 2000,
          max: 2,
          id: 'something',
          db: db
        });
        limit.newHit(function(err, res) {
          try {
            res.remaining.should.equal(2);
          } catch(err) {
            done(err);
          }

          limit.newHit(function(err, res) {
            try {
              res.remaining.should.equal(1);
            } catch(err) {
              done(err);
            }

            setTimeout(function() {
              limit.newHit(function(err, res) {
                try {
                  var left = res.reset - (Date.now() / 1000);
                  left.should.be.below(2);
                  res.remaining.should.equal(2);
                } catch(err) {
                  done(err);
                }

                done();
              });
            }, 3000);
          });
        });
      });
    });

    describe('when multiple successive calls are made', function() {
      it('the next calls should not create again the limiter in Redis', function(done) {
        var limit = new Limiter({
          duration: 10000,
          max: 2,
          id: 'something',
          db: db
        });
        limit.newHit(function(err, res) {
          try {
            res.remaining.should.equal(2);
          } catch(err) {
            done(err);
          }
        });

        limit.newHit(function(err, res) {
          try {
            res.remaining.should.equal(1);
          } catch(err) {
            done(err);
          }

          done();
        });
      });
      it('updating the count should keep all TTLs in sync', function(done) {
        var limit = new Limiter({
          duration: 10000,
          max: 2,
          id: 'something',
          db: db
        });
        limit.newHit(function(err, res) {}); // All good here.
        limit.newHit(function(err, res) {
          db.multi()
            .pttl(['limit:something:count'])
            .pttl(['limit:something:limit'])
            .pttl(['limit:something:reset'])
            .exec(function (err, res) {
              if (err) return done(err);
              var ttlCount = (typeof res[0] === 'number') ? res[0] : res[0][1];
              var ttlLimit = (typeof res[1] === 'number') ? res[1] : res[1][1];
              var ttlReset = (typeof res[2] === 'number') ? res[2] : res[2][1];
              try {
                ttlLimit.should.equal(ttlCount);
                ttlReset.should.equal(ttlCount);
              } catch(err) {
                done(err);
              }

              done();
            });
        });
      });
    });

    describe('when trying to decrease before setting value', function() {
      it('should create with ttl when trying to decrease', function(done) {
        var limit = new Limiter({
          duration: 10000,
          max: 2,
          id: 'something',
          db: db
        });
        db.setex('limit:something:count', -1, 1, function() {
          limit.newHit(function(err, res) {
            try {
              res.remaining.should.equal(2);
            } catch(err) {
              done(err);
            }

            limit.newHit(function(err, res) {
              try {
                res.remaining.should.equal(1);
              } catch(err) {
                done(err);
              }

              limit.newHit(function(err, res) {
                try {
                  res.remaining.should.equal(0);
                } catch(err) {
                  done(err);
                }

                done();
              });
            });
          });
        });
      });
    });

    describe('when multiple concurrent clients modify the limit', function() {
      var clientsCount = 7,
        max = 5,
        left = max,
        limits = [];

      for (var i = 0; i < clientsCount; ++i) {
        limits.push(new Limiter({
          duration: 10000,
          max: max,
          id: 'something',
          db: redisModule.createClient()
        }));
      }

      it('should prevent race condition and properly set the expected value', function(done) {
        var responses = [];

        function complete() {
          responses.push(arguments);

          if (responses.length == clientsCount) {
            // If there were any errors, report.
            var err = responses.some(function(res) {
              return res[0];
            });

            if (err) {
              done(err);
            } else {
              responses.forEach(function(res) {
                try {
                  res[1].remaining.should.equal(left < 0 ? 0 : left);
                } catch(err) {
                  done(err);
                } finally {
                  left--;
                }
              });

              for (var i = max - 1; i < clientsCount; ++i) {
                try {
                  responses[i][1].remaining.should.equal(0);
                } catch(err) {
                  done(err);
                }
              }

              done();
            }
          }
        }

        // Warm up and prepare the data.
        limits[0].newHit(function(err, res) {
          if (err) {
            done(err);
          } else {
            try {
              res.remaining.should.equal(left--);
            } catch(err) {
              done(err);
            }

            // Simulate multiple concurrent requests.
            limits.forEach(function(limit) {
              limit.newHit(complete);
            });
          }
        });
      });
    });
  });
});
