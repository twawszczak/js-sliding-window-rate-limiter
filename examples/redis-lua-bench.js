#!/usr/bin/env node

// Usage: time node examples/redis-lua-bench.js 10000 >/dev/null

'use strict'

const ATTEMPTS = process.argv[2] || 1
const INTERVAL = process.argv[3] || 60

const fs = require('fs')
const path = require('path')

const Redis = require('ioredis')

const lua = fs.readFileSync(path.join(__dirname, '../lib/sliding-window-rate-limiter.min.lua'), 'utf8')

async function main () {
  const redis = new Redis()

  redis.defineCommand('limiter', {
    lua,
    numberOfKeys: 1
  })

  const key = 'limiter'
  const interval = INTERVAL
  const limit = ATTEMPTS
  const ttl = INTERVAL * 2
  const reserve = 1

  for (let i = 1; i <= ATTEMPTS; i++) {
    const usage = await redis.limiter(key, interval, limit, ttl, reserve)
    console.log(usage)
  }

  await redis.quit()
}

main().catch(console.error)
