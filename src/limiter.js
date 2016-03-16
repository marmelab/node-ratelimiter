/**
 * Module dependencies.
 */

import assert from 'assert';
import redisAdapterFactory from './adapters/redis';

/**
  * Expose `Limiter`.
  */
export default class Limiter {
  /**
  * Initialize a new limiter with an adapter and `opts`:
  *
  *  - `id` identifier being limited
  *  - `max` maximum number of calls
  *  - `duration` the duration before reseting the number of calls
  *
  * @param {Object} opts
  * @param {Object} getFn: the function which will be called to get the rate limiting data
  * @api public
  */
  constructor(opts, adapterFactory) {
    this.id = opts.id;
    let finalAdapterFactory = adapterFactory;

    if (opts.db) {
      /* eslint-disable no-trailing-spaces */
      /* eslint-disable no-console */
      console.warn(`
Deprecation warning: initalizing redis options directly on the Limiter is
deprecated and will be removed in upcoming major release. Please refer to
https://github.com/tj/node-ratelimiter/blob/master/Readme.md which contains
instructions for migrating to the new adapters model.
`);
      /* eslint-enable no-trailing-spaces */
      /* eslint-enable no-console */

      finalAdapterFactory = redisAdapterFactory(opts.db);
    }

    assert(this.id, '.id required');
    this.max = opts.max || 2500;
    this.duration = opts.duration || 3600000;
    this.adapter = finalAdapterFactory(this.id, this.max, this.duration);
  }

  inspect() {
    return `<Limiter id='${this.id}', duration='${this.duration}', max='${this.max}'>`;
  }

  /**
  * Get values and header / status code and invoke `fn(err, info)`.
  *
  * @param {Function} fn - optional callback function.
  * @returns {Promise} If fn is not specified.
  * @api public
  */
  get(fn) {
    if (fn) {
      return this.adapter.get().then(res => fn(null, res)).catch(fn);
    }

    return this.adapter.get();
  }

  /**
  * Get values and header / status code and invoke `fn(err, info)`.
  *
  * @param {Function} fn - optional callback function.
  * @returns {Promise} If fn is not specified.
  * @api public
  */
  newHit(fn) {
    if (fn) {
      return this.adapter.newHit().then(res => fn(null, res)).catch(fn);
    }

    return this.adapter.newHit();
  }
}
