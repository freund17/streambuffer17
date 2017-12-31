/* global describe, it */

const assert = require('chai').assert
const StreamBuffer = require('../index.js')

async function writePromised (stream, chunk) {
  let pResolve, pReject
  const promise = new Promise((resolve, reject) => {
    pResolve = resolve
    pReject = reject
  })

  const result = stream.write(chunk, error => {
    if (error) {
      pReject(error)
    } else {
      pResolve(result)
    }
  })

  return promise
}

async function endPromised (stream) {
  let pResolve, pReject
  const promise = new Promise((resolve, reject) => {
    pResolve = resolve
    pReject = reject
  })

  stream.end(error => {
    if (error) {
      pReject(error)
    } else {
      pResolve(stream)
    }
  })

  return promise
}

async function createOpenTestStream (options) {
  const stream = new StreamBuffer(options)

  await writePromised(stream, Buffer.from([ 0xBE, 0xEF, 0xFE, 0xED ]))
  await writePromised(stream, Buffer.from([ 0x01, 0x23, 0x45, 0x67 ]))
  await writePromised(stream, Buffer.from([ 0x89, 0xAB, 0xCD, 0xEF ]))
  await writePromised(stream, Buffer.from([ 0x11, 0x23, 0x32, 0x11 ]))

  return stream
}

async function createTestStream (options) {
  const stream = await createOpenTestStream(options)
  await endPromised(stream)

  return stream
}

async function createTestStreamWithDroppedChunk () {
  const stream = await createTestStream({
    maxSize: 12
  })

  return stream
}

describe('StreamBuffer', function () {
  it('accepts data being written to it', async function () {
    await createTestStream()
  })

  it('caculates "size"', async function () {
    const stream = await createTestStream()

    assert.strictEqual(stream.size(), 16)
  })

  it('emits "resize"-event', async function () {
    const stream = await createOpenTestStream()
    let pResolve
    const promise = new Promise(resolve => {
      pResolve = resolve
    })

    stream.once('resize', pResolve)

    await writePromised(stream, Buffer.from([ 0x00, 0x11, 0x22, 0x33 ]))
    await endPromised(stream)

    await promise
  })

  it('replays data being written to it as buffer', async function () {
    const stream = await createTestStream()
    const expected = Buffer.from([
      0xBE, 0xEF, 0xFE, 0xED,
      0x01, 0x23, 0x45, 0x67,
      0x89, 0xAB, 0xCD, 0xEF,
      0x11, 0x23, 0x32, 0x11
    ])

    const buffer = await stream.getBuffer()

    assert(buffer.equals(expected))
  })

  it('replays data being written to it as buffer and waits for new data', async function () {
    const stream = await createOpenTestStream()
    const expected = Buffer.from([
      0xBE, 0xEF, 0xFE, 0xED,
      0x01, 0x23, 0x45, 0x67,
      0x89, 0xAB, 0xCD, 0xEF,
      0x11, 0x23, 0x32, 0x11,
      0x55, 0x55, 0x55, 0x55
    ])

    const pBuffer = stream.getBuffer()

    await writePromised(stream, Buffer.from([ 0x55, 0x55, 0x55, 0x55 ]))
    await endPromised(stream)

    assert((await pBuffer).equals(expected))
  })

  it('replays empty as buffer', async function () {
    const stream = new StreamBuffer()
    await endPromised(stream)
    const expected = Buffer.from([])

    const buffer = await stream.getBuffer()

    assert(buffer.equals(expected))
  })

  it('replays data being written to it as stream', async function () {
    const stream = await createTestStream()
    const expected = Buffer.from([
      0xBE, 0xEF, 0xFE, 0xED,
      0x01, 0x23, 0x45, 0x67,
      0x89, 0xAB, 0xCD, 0xEF,
      0x11, 0x23, 0x32, 0x11
    ])

    const newStream = stream.getStream()
    const newStreamBuffer = new StreamBuffer()

    newStream.pipe(newStreamBuffer)

    const buffer = await newStreamBuffer.getBuffer()

    assert(buffer.equals(expected))
  })

  it('replays data being written to it as stream and waits for new data', async function () {
    const stream = await createOpenTestStream()
    const expected = Buffer.from([
      0xBE, 0xEF, 0xFE, 0xED,
      0x01, 0x23, 0x45, 0x67,
      0x89, 0xAB, 0xCD, 0xEF,
      0x11, 0x23, 0x32, 0x11,
      0x55, 0x55, 0x55, 0x55
    ])

    const newStream = stream.getStream()
    const newStreamBuffer = new StreamBuffer()
    newStream.pipe(newStreamBuffer)

    await writePromised(stream, Buffer.from([ 0x55, 0x55, 0x55, 0x55 ]))
    await endPromised(stream)

    const buffer = await newStreamBuffer.getBuffer()

    assert(buffer.equals(expected))
  })

  it('replays empty as stream', async function () {
    const stream = new StreamBuffer()
    await endPromised(stream)
    const expected = Buffer.from([])

    const newStream = stream.getStream()
    const newStreamBuffer = new StreamBuffer()

    newStream.pipe(newStreamBuffer)

    const buffer = await newStreamBuffer.getBuffer()

    assert(buffer.equals(expected))
  })

  it('splits chunks into smaller buffers', async function () {
    const stream = await createTestStream()
    const expected = Buffer.from([
      0xEF, 0xFE
    ])

    const buffer = await stream.getBuffer(2, 1)

    assert(buffer.equals(expected))
  })

  it('merges chunks into bigger buffers', async function () {
    const stream = await createTestStream()
    const expected = Buffer.from([
      0xBE, 0xEF, 0xFE, 0xED,
      0x01, 0x23, 0x45, 0x67
    ])

    const buffer = await stream.getBuffer(8)

    assert(buffer.equals(expected))
  })

  it('splits and merges chunks into buffers', async function () {
    const stream = await createTestStream()
    const expected = Buffer.from([
      0xFE, 0xED,
      0x01, 0x23, 0x45, 0x67,
      0x89, 0xAB
    ])

    const buffer = await stream.getBuffer(8, 2)

    assert(buffer.equals(expected))
  })

  it('sets "seek"', async function () {
    const stream = await createTestStream()

    stream.seek(2)

    assert.strictEqual(stream.seek(), 2)
  })

  it('uses "seek" as default offset', async function () {
    const stream = await createTestStream()
    const expected = Buffer.from([ 0xFE, 0xED ])

    stream.seek(2)
    const buffer = await stream.getBuffer(2)

    assert(buffer.equals(expected))
  })

  it('sets "seek" to where the last buffer will end', async function () {
    const stream = await createTestStream()

    const pBuffer = stream.getBuffer(2)

    assert.strictEqual(stream.seek(), 2)

    await pBuffer
  })

  it('sets "seek" to "null" when last buffer has no end and the end is unknown', async function () {
    const stream = await createOpenTestStream()

    const pBuffer = stream.getBuffer()

    assert.strictEqual(stream.seek(), null)
    await endPromised(stream)

    await pBuffer
  })

  it('sets "seek" to where the last stream will end', async function () {
    const stream = await createTestStream()

    stream.getStream(2)

    assert.strictEqual(stream.seek(), 2)
  })

  it('sets "seek" to "null" when last stream has no end and the end is unknown', async function () {
    const stream = await createOpenTestStream()

    stream.getStream()

    assert.strictEqual(stream.seek(), null)
    await endPromised(stream)
  })

  it('sets "seek" of "null" to actual number when it becomes known', async function () {
    const stream = await createOpenTestStream()

    const pBuffer = stream.getBuffer()

    assert.strictEqual(stream.seek(), null)
    await endPromised(stream)

    assert.strictEqual(stream.seek(), 16)

    await pBuffer
  })

  it('sets "seek" synchronously', async function () {
    const stream = await createTestStream()

    const expectedA = Buffer.from([ 0xBE, 0xEF ])
    const expectedB = Buffer.from([ 0x01, 0x23 ])
    const expectedC = Buffer.from([ 0xFE, 0xED ])

    const pBufferA = stream.getBuffer(2)
    stream.getStream(2)
    const pBufferB = stream.getBuffer(2)
    stream.seek(2)
    const pBufferC = stream.getBuffer(2)

    const [
      bufferA,
      bufferB,
      bufferC
    ] = await Promise.all([
      pBufferA,
      pBufferB,
      pBufferC
    ])

    assert(bufferA.equals(expectedA))
    assert(bufferB.equals(expectedB))
    assert(bufferC.equals(expectedC))
  })

  it('rejects buffers, when the requested offset lies in an already deleted chunk', async function () {
    const stream = await createTestStreamWithDroppedChunk()
    let failed = false

    try {
      await stream.getBuffer()
      failed = true
    } catch (error) {
      // noop
    }

    assert.isFalse(failed)
  })

  it('rejects buffers, when the requested offset is beyond the end of the stream', async function () {
    const stream = await createTestStream()
    let failed = false

    try {
      await stream.getBuffer(1, 16)
      failed = true
    } catch (error) {
      // noop
    }

    assert.isFalse(failed)
  })

  it('rejects buffers, when the requested length is unavailable', async function () {
    const stream = await createTestStream()
    let failed = false

    try {
      await stream.getBuffer(17)
      failed = true
    } catch (error) {
      // noop
    }

    assert.isFalse(failed)
  })

  it('returns buffer of remaining length, when no length is specified', async function () {
    const stream = await createTestStream()
    const buffer = await stream.getBuffer()

    assert.strictEqual(buffer.length, 16)
  })

  it('destroys streams, when the requested offset lies in an already deleted chunk', async function () {
    const stream = await createTestStreamWithDroppedChunk()
    const testStream = stream.getStream()
    testStream.resume()
    let failed = false

    const testStreamPromise = new Promise((resolve, reject) => {
      testStream.once('error', reject)
    })

    try {
      await testStreamPromise
      failed = true
    } catch (error) {
      // noop
    }

    assert.isFalse(failed)
  })

  it('destroys streams, when the requested offset is beyond the end of the stream', async function () {
    const stream = await createTestStream()
    const testStream = stream.getStream(1, 16)
    testStream.resume()
    let failed = false

    const testStreamPromise = new Promise((resolve, reject) => {
      testStream.once('error', reject)
    })

    try {
      await testStreamPromise
      failed = true
    } catch (error) {
      // noop
    }

    assert.isFalse(failed)
  })

  it('destroys streams, when the requested length is unavailable', async function () {
    const stream = await createTestStream()
    const testStream = stream.getStream(17)
    testStream.resume()
    let failed = false

    const testStreamPromise = new Promise((resolve, reject) => {
      testStream.once('error', reject)
    })

    try {
      await testStreamPromise
      failed = true
    } catch (error) {
      // noop
    }

    assert.isFalse(failed)
  })

  it('returns stream of remaining length, when no length is specified', async function () {
    const stream = await createTestStream()
    const testStream = stream.getStream()

    const tmpStream = new StreamBuffer()
    testStream.pipe(tmpStream)

    const buffer = await tmpStream.getBuffer()

    assert.strictEqual(buffer.length, 16)
  })

  it('rejects buffers, when destroyed', async function () {
    const stream = await createOpenTestStream()
    stream.once('error', () => {})
    stream.destroy()
    let failed = false

    try {
      await stream.getBuffer()
      failed = true
    } catch (error) {
      // noop
    }

    assert.isFalse(failed)
  })

  it('destroys streams, when destroyed', async function () {
    const stream = await createOpenTestStream()
    stream.once('error', () => {})
    stream.destroy()
    let failed = false

    const testStream = stream.getStream()
    testStream.resume()

    const testStreamPromise = new Promise((resolve, reject) => {
      testStream.once('error', reject)
    })

    try {
      await testStreamPromise
      failed = true
    } catch (error) {
      // noop
    }

    assert.isFalse(failed)
  })

  it('rejects pending buffers, when destroyed', async function () {
    const stream = await createOpenTestStream()
    const pBuffer = stream.getBuffer()
    stream.once('error', () => {})
    stream.destroy()
    let failed = false

    try {
      await pBuffer
      failed = true
    } catch (error) {
      // noop
    }

    assert.isFalse(failed)
  })

  it('destroys pending streams, when destroyed', async function () {
    const stream = await createOpenTestStream()
    const testStream = stream.getStream()
    testStream.resume()
    let failed = false

    const testStreamPromise = new Promise((resolve, reject) => {
      testStream.once('error', reject)
    })

    stream.once('error', () => {})
    stream.destroy()

    try {
      await testStreamPromise
      failed = true
    } catch (error) {
      // noop
    }

    assert.isFalse(failed)
  })

  it('rejects buffers bigger then "maxBufferSize"', async function () {
    const stream = await createTestStream({
      maxBufferSize: 6
    })
    let failed = false

    try {
      await stream.getBuffer()
      failed = true
    } catch (error) {
      // noop
    }

    assert.isFalse(failed)
  })

  it('returns error when trying to write to an already closed stream', async function () {
    const stream = new StreamBuffer()
    await endPromised(stream)
    let failed = false

    try {
      await writePromised(stream, Buffer.from([ 0x00 ]))
      failed = true
    } catch (error) {
      // noop
    }

    assert.isFalse(failed)
  })

  it('auto-seeks-offsets to the end of stream for buffer', async function () {
    const stream = await createTestStream()
    await stream.getBuffer()

    const buffer = await stream.getBuffer()

    assert.strictEqual(buffer.length, 0)
  })

  it('auto-seeks-offsets to the end of open stream for buffer', async function () {
    const stream = await createOpenTestStream()
    stream.getBuffer()

    const pBuffer = stream.getBuffer()
    await writePromised(stream, Buffer.from([ 0x00 ]))
    await endPromised(stream)

    assert.strictEqual((await pBuffer).length, 0)
  })

  it('auto-seeks-offsets to the end of stream for stream', async function () {
    const stream = await createTestStream()
    await stream.getBuffer()

    const testStream = stream.getStream()
    const testStreamBuffer = new StreamBuffer()
    testStream.pipe(testStreamBuffer)

    const buffer = await testStreamBuffer.getBuffer()

    assert.strictEqual(buffer.length, 0)
  })

  it('auto-seeks-offsets to the end of open stream for stream', async function () {
    const stream = await createOpenTestStream()
    stream.getBuffer()

    const testStream = stream.getStream()
    const testStreamBuffer = new StreamBuffer()
    testStream.pipe(testStreamBuffer)

    await writePromised(stream, Buffer.from([ 0x00 ]))
    await endPromised(stream)

    const buffer = await testStreamBuffer.getBuffer()

    assert.strictEqual(buffer.length, 0)
  })

  // it('drops chunks at the start of the stream, when "size" exceeds "maxSize"') // already handled by above testcases
  // it('rejects pending buffers dependent on dropped chunks') // already handled by above testcases
  // it('destroys pending streams dependent on dropped chunks') // already handled by above testcases
})
