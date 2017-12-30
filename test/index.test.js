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

    assert.deepEqual(stream.seek(), 2)
  })

  it('uses "seek" as default offset', async function () {
    const stream = await createTestStream()
    const expected = Buffer.from([
      0xFE, 0xED,
      0x01, 0x23, 0x45, 0x67,
      0x89, 0xAB
    ])

    stream.seek(2)
    const buffer = await stream.getBuffer(8)

    assert(buffer.equals(expected))
  })

  it('sets "seek" to where the last buffer will end', async function () {
    const stream = await createTestStream()

    const pBuffer = stream.getBuffer(2)

    assert.deepEqual(stream.seek(), 2)

    await pBuffer
  })

  it('sets "seek" to "null" when last buffer has no end and the end is unknown', async function () {
    const stream = await createOpenTestStream()

    const pBuffer = stream.getBuffer()

    assert.deepEqual(stream.seek(), null)
    await endPromised(stream)

    await pBuffer
  })

  it('sets "seek" to where the last stream will end', async function () {
    const stream = await createTestStream()

    stream.getStream(2)

    assert.deepEqual(stream.seek(), 2)
  })

  it('sets "seek" to "null" when last stream has no end and the end is unknown', async function () {
    const stream = await createOpenTestStream()

    stream.getStream()

    assert.deepEqual(stream.seek(), null)
    await endPromised(stream)
  })

  it('sets "seek" of "null" to actual number when it becomes known', async function () {
    const stream = await createOpenTestStream()

    const pBuffer = stream.getBuffer()

    assert.deepEqual(stream.seek(), null)
    await endPromised(stream)

    assert.deepEqual(stream.seek(), 16)

    await pBuffer
  })

  it('rejects buffers, when the requested offset lies in an already deleted chunk', async function () {
    const stream = await createTestStreamWithDroppedChunk()

    try {
      await stream.getBuffer()
      assert.fail()
    } catch (error) {
      // noop
    }
  })

  it('rejects buffers, when the requested offset is beyond the end of the stream', async function () {
    const stream = await createTestStream()

    try {
      await stream.getBuffer(1, 16)
      assert.fail()
    } catch (error) {
      // noop
    }
  })

  it('rejects buffers, when the requested length is unavailable', async function () {
    const stream = await createTestStream()

    try {
      await stream.getBuffer(17)
      assert.fail()
    } catch (error) {
      // noop
    }
  })

  it('returns buffer of remaining length, when no length is specified', async function () {
    const stream = await createTestStream()
    const buffer = await stream.getBuffer()

    assert.strictEqual(buffer.length, 16)
  })

  it('destroys streams, when the requested offset lies in an already deleted chunk', async function () {
    const stream = await createTestStreamWithDroppedChunk()
    const testStream = stream.getStream()

    const testStreamPromise = new Promise((resolve, reject) => {
      testStream.on('error', reject)
      testStream.on('end', resolve)
    })

    try {
      await testStreamPromise
      assert.fail()
    } catch (error) {
      // noop
    }
  })

  it('destroys streams, when the requested offset is beyond the end of the stream', async function () {
    const stream = await createTestStream()
    const testStream = stream.getStream(1, 16)

    const testStreamPromise = new Promise((resolve, reject) => {
      testStream.on('error', reject)
      testStream.on('end', resolve)
    })

    try {
      await testStreamPromise
      assert.fail()
    } catch (error) {
      // noop
    }
  })

  it('errors and ends streams, when the requested length is unavailable', async function () {
    const stream = await createTestStream()
    const testStream = stream.getStream(17)

    const testStreamPromise = new Promise((resolve, reject) => {
      testStream.on('error', reject)
      testStream.on('end', resolve)
    })

    try {
      await testStreamPromise
      assert.fail()
    } catch (error) {
      // noop
    }
  })

  it('returns stream of remaining length, when no length is specified', async function () {
    const stream = await createTestStream()
    const testStream = stream.getStream(17)

    const testStreamPromise = new Promise((resolve, reject) => {
      testStream.on('error', reject)
      testStream.on('end', resolve)
    })

    await testStreamPromise

    const tmpStream = new StreamBuffer()
    testStream.pipe(tmpStream)

    const buffer = await tmpStream.getBuffer()

    assert.strictEqual(buffer.length, 16)
  })

  it('rejects buffers, when destroyed', async function () {
    const stream = await createOpenTestStream()
    stream.destroy()

    try {
      await stream.getBuffer()
      assert.fail()
    } catch (error) {
      // noop
    }
  })

  it('destroys streams, when destroyed', async function () {
    const stream = await createOpenTestStream()
    stream.destroy()

    const testStream = stream.getStream()

    const testStreamPromise = new Promise((resolve, reject) => {
      testStream.on('error', reject)
      testStream.on('end', resolve)
    })

    try {
      await testStreamPromise
      assert.fail()
    } catch (error) {
      // noop
    }
  })

  it('rejects pending buffers, when destroyed', async function () {
    const stream = await createOpenTestStream()
    const pBuffer = stream.getBuffer()
    stream.destroy()

    try {
      await pBuffer
      assert.fail()
    } catch (error) {
      // noop
    }
  })

  it('destroys pending streams, when destroyed', async function () {
    const stream = await createOpenTestStream()
    const testStream = stream.getStream()

    const testStreamPromise = new Promise((resolve, reject) => {
      testStream.on('error', reject)
      testStream.on('end', resolve)
    })

    stream.destroy()

    try {
      await testStreamPromise
      assert.fail()
    } catch (error) {
      // noop
    }
  })

  it('rejects buffers bigger then "maxBufferSize"', async function () {
    const stream = await createTestStream({
      maxBufferSize: 6
    })

    try {
      await stream.getBuffer()
      assert.fail()
    } catch (error) {
      // noop
    }
  })

  it('signals incoming stream to pause, when no getter is requesting chunks beyond the currently loaded ones', async function () {
    const stream = new StreamBuffer()

    assert.isFalse(await writePromised(stream, Buffer.from([ 0x00, 0x00, 0x00 ])))
    assert.isFalse(await writePromised(stream, Buffer.from([ 0x00 ])))

    const pBuffer = stream.getBuffer()

    assert.isTrue(await writePromised(stream, Buffer.from([ 0x00 ])))
    assert.isTrue(await writePromised(stream, Buffer.from([ 0x00 ])))

    await endPromised(stream)
    await pBuffer
  })

  it('drops chunks at the start of the stream, when "size" exceeds "maxSize"')
  // it('rejects pending buffers dependent on dropped chunks') // will not happen since buffers are read immediately
  it('destroys pending streams dependent on dropped chunks') // should be handled by above testcase
})
