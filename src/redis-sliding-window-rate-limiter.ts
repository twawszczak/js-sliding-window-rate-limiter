/// <reference types="node" />

import { EventEmitter } from 'events'
import fs from 'fs'
import IORedis from 'ioredis'
import path from 'path'

import {
  SlidingWindowRateLimiterBackend,
  SlidingWindowRateLimiterBackendOptions
} from './sliding-window-rate-limiter-backend'

type ms = number
type s = number

enum LimiterMode {
  Check,
  Reserve,
  Cancel
}

// TODO: maxRetriesPerRequest is not a part of IORedis.RedisOptions yet
export interface RedisOptions extends IORedis.RedisOptions {
  maxRetriesPerRequest: number
}

// Additional command defined
export interface Redis extends IORedis.Redis {
  limiter (key: string, mode: LimiterMode, interval: s, limit: number, ts: ms): Promise<number | ms>
}

export interface RedisSlidingWindowRateLimiterOptions extends SlidingWindowRateLimiterBackendOptions {
  redis?: Redis | string
  interval?: number
  operationTimeout?: number
}

const lua = process.env.DEBUG_SLIDING_WINDOW_RATELIMITER_LUA
  ? fs.readFileSync(path.join(__dirname, '../src/sliding-window-rate-limiter.lua'), 'utf8')
  : fs.readFileSync(path.join(__dirname, '../lib/sliding-window-rate-limiter.min.lua'), 'utf8')

export class RedisSlidingWindowRateLimiter extends EventEmitter implements SlidingWindowRateLimiterBackend {
  readonly interval: s
  readonly redis: Redis
  protected readonly operationTimeout: number = this.options.operationTimeout || 0

  constructor (readonly options: RedisSlidingWindowRateLimiterOptions = {}) {
    super()

    this.interval = Number(options.interval) || 60 as s

    if (!options.redis || typeof options.redis === 'string') {
      this.redis = new IORedis({
        host: options.redis,
        retryStrategy: (_times) => 1000 as ms,
        maxRetriesPerRequest: 1
      } as RedisOptions) as Redis
    } else {
      this.redis = options.redis
    }

    this.redis.defineCommand('limiter', {
      lua,
      numberOfKeys: 1
    })
  }

  check (key: string, limit: number): Promise<number> {
    return this.limiter(key, LimiterMode.Check, this.interval, limit, 0)
  }

  reserve (key: string, limit: number): Promise<number | ms> {
    return this.limiter(key, LimiterMode.Reserve, this.interval, limit, 0)
  }

  cancel (key: string, ts: ms): Promise<number | ms> {
    return this.limiter(key, LimiterMode.Cancel, this.interval, 0, ts)
  }

  destroy (): void {
    if (!this.options.redis || typeof this.options.redis === 'string') {
      try {
        this.redis.quit().catch(() => {
          this.redis.disconnect()
        })
      } catch (e) {
        this.redis.disconnect()
      }
    }
  }

  protected limiter (key: string, mode: LimiterMode, interval: s, limit: number, ts: ms): Promise<number | ms> {
    try {
      if (!this.operationTimeout) {
        return this.redis.limiter(key, mode, interval, limit, ts)
      } else {
        return this.handleTimeout(this.redis.limiter(key, mode, interval, limit, ts))
      }
    } catch (e) {
      return Promise.reject(e)
    }
  }

  protected handleTimeout<T> (operationPromise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let responseReturned = false
      const timer = setTimeout(() => {
        if (!responseReturned) {
          responseReturned = true
          reject(new Error('Operation timed out.'))
        }
      }, this.operationTimeout)

      function createOperationCallback (success: boolean = true): (result: any) => void {
        return (result: any) => {
          clearTimeout(timer)
          responseReturned = true
          success ? resolve(result) : reject(result)
        }
      }

      operationPromise.then(createOperationCallback(true)).catch(createOperationCallback(false))
    })
  }
}

export default RedisSlidingWindowRateLimiter
