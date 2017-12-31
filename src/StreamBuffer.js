const { Writable } = require('stream')
const StreamBufferReader = require('./StreamBufferReader')

/**
 * A writable stream that allows for replaying, seeking and slicing of the streamed content.
 */
class StreamBuffer extends Writable {
  constructor (options) {
    super(options)

    this._chunks = [] // { chunk, end, start }
    this._ended = false
    this._destroyed = false
    this._error = null

    this._seek = 0

    options = options || {}
    this._maxSize = options.maxSize || Infinity
    this._maxBufferSize = options.maxBufferSize || Infinity

    this._newChunksAvailableFn = () => {}
    this._newChunksAvailable = null
    this._triggerNewChunksAvailable()
  }

  _triggerNewChunksAvailable () {
    this._newChunksAvailableFn()
    this._newChunksAvailable = new Promise(resolve => {
      this._newChunksAvailableFn = resolve
    })
  }

  _getCurrentEndOffset () {
    if (this._chunks.length === 0) {
      return 0
    }

    return this._chunks[this._chunks.length - 1].end
  }

  _dropChunk () {
    this._chunks.shift()
  }

  _appendChunk (chunk) {
    const oldSize = this.size()
    const start = this._getCurrentEndOffset()
    const end = start + chunk.length

    this._chunks.push({
      chunk,
      end,
      start
    })

    while (this._chunks.length > 1 && this.size() > this._maxSize) {
      this._dropChunk()
    }

    this._triggerNewChunksAvailable()
    this.emit('resize', {
      size: this.size(),
      oldSize
    })
  }

  _write (chunk, encoding, callback) {
    try {
      this._appendChunk(chunk)
    } catch (error) {
      return process.nextTick(() => callback(error))
    }

    return process.nextTick(() => callback(null))
  }

  _writev (chunks, callback) {
    try {
      for (const { chunk } of chunks) {
        this._appendChunk(chunk)
      }
    } catch (error) {
      return process.nextTick(() => callback(error))
    }

    return process.nextTick(() => callback(null))
  }

  _destroy (error, callback) {
    if (!error) {
      error = new Error('Stream destroyed!')
    }

    this._destroyed = true
    this._error = error
    this._chunks = []
    this._triggerNewChunksAvailable()

    return process.nextTick(() => callback(error))
  }

  _final (callback) {
    this._ended = true

    // refresh seek to maybe resolve null
    this.seek(this.seek())
    this._triggerNewChunksAvailable()

    return process.nextTick(() => callback(null))
  }

  _getNextChunk (offset, end) {
    if (this._destroyed) {
      throw this._error
    }

    const chunk = this._chunks.find(chunk => offset < chunk.end)

    // chunk not jet loaded
    if (!chunk) {
      // chunk will never load
      if (this._ended) {
        // allow zero-length buffer at the very end
        if (offset === this._getCurrentEndOffset() && (end === Infinity || end === offset)) {
          return Buffer.alloc(0)
        }

        throw new Error('chunk-offset out of bounds!')
      }

      // might load later
      return null
    } else if (offset < chunk.start) {
      // chunk already deleted
      throw new Error('chunk gone!')
    }

    // chunk available
    return chunk.chunk.slice(offset - chunk.start, end - chunk.start)
  }

  async getBuffer (length, offset) {
    if (typeof length === 'undefined') {
      length = null
    }

    if (length === null) {
      length = Infinity
    }

    if (typeof offset === 'undefined') {
      offset = null
    }

    if (offset === null) {
      offset = this.seek()
    }

    while (offset === null && !this._ended && !this._destroyed) {
      await this._newChunksAvailable

      if (this._ended) {
        offset = this._getCurrentEndOffset()
      }
    }

    let currentPos = offset
    let endPos = offset + length
    const chunks = []

    this.seek(endPos)

    while (currentPos < endPos) {
      const chunk = this._getNextChunk(currentPos, endPos)

      if (chunk === null) {
        await this._newChunksAvailable
      } else {
        chunks.push(chunk)
        currentPos += chunk.length

        if (currentPos - offset > this._maxBufferSize) {
          throw new Error('maxBufferSize exceeded!')
        }
      }

      if (this._ended && endPos === Infinity) {
        endPos = this._getCurrentEndOffset()
      }
    }

    return Buffer.concat(chunks, currentPos - offset)
  }

  getStream (length, offset, options) {
    if (typeof length === 'undefined') {
      length = null
    }

    if (length === null) {
      length = Infinity
    }

    if (typeof offset === 'undefined') {
      offset = null
    }

    if (offset === null) {
      offset = this.seek()
    }

    if (offset === null) {
      // hacky way to get a valid zero-length stream
      const anyLoadedPoint = this._getCurrentEndOffset()
      const result = new StreamBufferReader(this, anyLoadedPoint, anyLoadedPoint, options)

      // destroy stream, when no zero-length expected
      if (length !== 0 && length !== Infinity) {
        result.destroy(new Error('out of bounds'))
      }

      return result
    }

    const endPos = offset + length

    this.seek(endPos)

    return new StreamBufferReader(this, offset, endPos, options)
  }

  seek (newSeek) {
    if (typeof newSeek !== 'undefined') {
      if (newSeek === Infinity) {
        newSeek = null
      }

      if (newSeek === null && this._ended) {
        newSeek = this._getCurrentEndOffset()
      }

      this._seek = newSeek
    }

    return this._seek
  }

  size () {
    if (this._chunks.length === 0) {
      return 0
    }

    return this._chunks[this._chunks.length - 1].end - this._chunks[0].start
  }
}

module.exports = StreamBuffer
