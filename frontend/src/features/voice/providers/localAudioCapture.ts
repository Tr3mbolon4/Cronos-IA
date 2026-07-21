type LocalAudioCapture = {
  stop: () => Uint8Array
  cancel: () => void
}

export async function startLocalAudioCapture(
  stream: MediaStream,
  onLevel: (level: number) => void,
): Promise<LocalAudioCapture> {
  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext
  if (!AudioContextConstructor) throw new Error('Web Audio API indisponivel neste runtime.')

  const context = new AudioContextConstructor()
  const source = context.createMediaStreamSource(stream)
  const processor = context.createScriptProcessor(4096, 1, 1)
  const chunks: Float32Array[] = []
  let cancelled = false

  processor.onaudioprocess = (event) => {
    if (cancelled) return
    const input = event.inputBuffer.getChannelData(0)
    chunks.push(new Float32Array(input))
    let peak = 0
    for (const sample of input) peak = Math.max(peak, Math.abs(sample))
    onLevel(Math.min(100, Math.round(peak * 140)))
  }

  source.connect(processor)
  processor.connect(context.destination)

  function closeGraph() {
    processor.disconnect()
    source.disconnect()
    void context.close()
  }

  return {
    stop: () => {
      closeGraph()
      return encodeWav16kMono(chunks, context.sampleRate)
    },
    cancel: () => {
      cancelled = true
      chunks.length = 0
      closeGraph()
    },
  }
}

function encodeWav16kMono(chunks: Float32Array[], sourceSampleRate: number): Uint8Array {
  const source = mergeChunks(chunks)
  const resampled = resampleLinear(source, sourceSampleRate, 16_000)
  const dataSize = resampled.length * 2
  const bytes = new Uint8Array(44 + dataSize)
  const view = new DataView(bytes.buffer)
  writeAscii(bytes, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeAscii(bytes, 8, 'WAVE')
  writeAscii(bytes, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, 16_000, true)
  view.setUint32(28, 32_000, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeAscii(bytes, 36, 'data')
  view.setUint32(40, dataSize, true)
  let offset = 44
  for (const sample of resampled) {
    const clamped = Math.max(-1, Math.min(1, sample))
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true)
    offset += 2
  }
  return bytes
}

function mergeChunks(chunks: Float32Array[]) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0)
  const output = new Float32Array(length)
  let offset = 0
  for (const chunk of chunks) {
    output.set(chunk, offset)
    offset += chunk.length
  }
  return output
}

function resampleLinear(source: Float32Array, sourceRate: number, targetRate: number) {
  if (sourceRate === targetRate) return source
  const ratio = sourceRate / targetRate
  const targetLength = Math.max(1, Math.round(source.length / ratio))
  const output = new Float32Array(targetLength)
  for (let index = 0; index < targetLength; index += 1) {
    const sourceIndex = index * ratio
    const left = Math.floor(sourceIndex)
    const right = Math.min(left + 1, source.length - 1)
    const weight = sourceIndex - left
    output[index] = source[left] * (1 - weight) + source[right] * weight
  }
  return output
}

function writeAscii(bytes: Uint8Array, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    bytes[offset + index] = value.charCodeAt(index)
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext
  }
}
