const { Readable } = require('stream')

/**
 * Helper to allow reading from the StreamBuffer as a stream
 */
class StreamBufferReader extends Readable {
  constructor (streamCache, startPos, endPos, options) {
    super(options)

    this._streamCache = streamCache
    this._currentPos = startPos
    this._endPos = endPos
    this._isReading = false
  }

  async _doPush () {
    if (this._isReading) {
      return
    }

    this._isReading = true

    do {
      if (this._currentPos < this._endPos) {
        const chunk = this._streamCache._getNextChunk(this._currentPos, this._endPos)

        if (chunk === null) {
          await this._streamCache._newChunksAvailable
        } else {
          this._isReading = this.push(chunk)
          this._currentPos += chunk.length
        }

        if (this._streamCache._ended && this._endPos === Infinity) {
          this._endPos = this._streamCache._getCurrentEndOffset()
        }
      } else {
        this.push(null)
        this._isReading = false
      }
    } while (this._isReading)
  }

  _read (size) {
    this._doPush().catch(error => {
      this._isReading = false
      this.destroy(error)
    })
  }
}

module.exports = StreamBufferReader
