import 'should';
import adapterFactory from './memory';
import sinon from 'sinon';

describe('MemoryAdapter', () => {
    let sandbox;
    beforeEach(() => {
        sandbox = sinon.sandbox.create();
    });

    it('should create a new entry executing id (if a function) in global dictionnary', done => {
        const idSpy = sandbox.spy();
        adapterFactory()(idSpy, 5, 2000).get();

        idSpy.called.should.be.true();
        done();
    });

    describe('.newHit', () => {
        describe('.total', () => {
            it('should represent the total limit per reset period', done => {
                const adapter = adapterFactory()('foo', 5, 100000);
                adapter.newHit()
                .then(res => {
                    res.total.should.equal(5);
                })
                .then(done)
                .catch(done);
            });
        });

        describe('.remaining', () => {
            it('should represent the number of requests remaining in the reset period', done => {
                const adapter = adapterFactory()('foo', 5, 100000);
                adapter.newHit()
                    .then(res => {
                        res.remaining.should.equal(5);
                    })
                    .then(adapter.newHit)
                    .then(res => {
                        res.remaining.should.equal(4);
                    })
                    .then(adapter.newHit)
                    .then(res => {
                        res.remaining.should.equal(3);
                    })
                    .then(done)
                    .catch(done);
            });
        });

        describe('.reset', () => {
            it('should represent the next reset time in UTC epoch seconds', done => {
                const adapter = adapterFactory()('foo', 5, 60000);
                adapter.newHit()
                    .then(res => {
                        const left = res.reset - (Date.now() / 1000);
                        left.should.be.within(0, 60);
                    })
                    .then(done)
                    .catch(done);
            });
        });

        describe('when the limit is exceeded', () => {
            it('should retain .remaining at 0', done => {
                const adapter = adapterFactory()('foo', 2, 10000);
                adapter.newHit()
                    .then(res => {
                        res.remaining.should.equal(2);
                    })
                    .then(adapter.newHit)
                    .then(res => {
                        res.remaining.should.equal(1);
                    })
                    .then(adapter.newHit)
                    .then(res => {
                        // function caller should reject this call
                        res.remaining.should.equal(0);
                    })
                    .then(done)
                    .catch(done);
            });
        });

        describe('when the duration is exceeded', function testDuration() {
            it('should reset', done => {
                this.timeout(5000);
                const adapter = adapterFactory()('foo', 2, 1000);
                adapter.newHit().then(res => {
                    res.remaining.should.equal(2);
                })
                .then(adapter.newHit)
                .then(res => {
                    res.remaining.should.equal(1);
                    setTimeout(() => {
                        adapter.newHit().then(res2 => {
                            const left = res2.reset - (Date.now() / 1000);
                            left.should.be.above(0);
                            left.should.be.below(2);
                            res2.remaining.should.equal(2);
                            done();
                        }).catch(done);
                    }, 1500);
                })
                .catch(done);
            });
        });
    });

    afterEach(() => {
        if (sandbox) {
            sandbox.restore();
        }
    });
});
