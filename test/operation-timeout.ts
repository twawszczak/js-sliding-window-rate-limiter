import { And, Feature, Given, Scenario, Then } from './lib/steps'

import uuidv1 from 'uuid/v1'
import RedisSlidingWindowRateLimiter from '../src/redis-sliding-window-rate-limiter'
import { Redis } from '../src/sliding-window-rate-limiter'
import MockIORedis from './lib/mock-ioredis'

Feature('Test sliding-window-rate-limiter Redis failure with safe backend', () => {
  const defaultLimit = 1
  let error: Error | { message: string }

  let redis: Redis
  let limiter: RedisSlidingWindowRateLimiter
  let key: string
  let operationDelay: number
  let operationTimeout: number

  Scenario('operation timeout', () => {
    Given('operation timeout shorter then operation delay', () => {
      operationTimeout = 2 * 1000
      operationDelay = 3 * 1000
    })

    And('reset error', () => {
      error = { message: '' }
    })

    And('redis connection', () => {
      redis = new MockIORedis({}, operationDelay)
    })

    And('limiter object', () => {
      limiter = new RedisSlidingWindowRateLimiter({
        interval: 1,
        redis,
        operationTimeout
      })
    })

    And('key', () => {
      key = 'redis-failure:' + uuidv1()
    })

    And('check method is called', async () => {
      try {
        await limiter.check(key, defaultLimit)
      } catch (e) {
        error = e
      }

    })

    Then('timeout error was fired', () => {
      error.should.be.instanceOf(Error)
      error.message.should.equal('Operation timed out.')
    })
  })

  Scenario('operation timeout not fired', () => {
    Given('operation timeout longer then operation delay', () => {
      operationTimeout = 3 * 1000
      operationDelay = 2 * 1000
    })

    And('reset error', () => {
      error = { message: '' }
    })

    And('redis connection', () => {
      redis = new MockIORedis({}, operationDelay)
    })

    And('limiter object', () => {
      limiter = new RedisSlidingWindowRateLimiter({
        interval: 1,
        redis,
        operationTimeout
      })
    })

    And('key', () => {
      key = 'redis-failure:' + uuidv1()
    })

    And('check method is called', async () => {
      try {
        await limiter.check(key, defaultLimit)
      } catch (e) {
        error = e
      }

    })

    Then('timeout error was not fired', () => {
      error.should.be.not.instanceOf(Error)
      error.message.should.equal('')
    })
  })
})
