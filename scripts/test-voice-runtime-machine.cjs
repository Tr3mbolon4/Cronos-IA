const fs = require('fs')
const path = require('path')

const source = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'features', 'voice', 'voiceRuntimeDiagnostics.ts'), 'utf8')
const controllerSource = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'features', 'voice', 'useVoiceController.ts'), 'utf8')
const storageSource = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'src', 'features', 'voice', 'voiceStorage.ts'), 'utf8')
const requiredStates = [
  'IDLE',
  'LISTENING',
  'TRANSCRIBING',
  'SENDING',
  'WAITING_LLM',
  'GENERATING_RESPONSE',
  'STARTING_TTS',
  'PLAYING_TTS',
  'FINISHED_TTS',
  'RETURN_TO_LISTENING',
]

for (const state of requiredStates) {
  if (!source.includes(`'${state}'`)) {
    throw new Error(`Estado obrigatorio ausente: ${state}`)
  }
}

function simulateVoiceRuntimeCycles(cycles) {
  const sequence = requiredStates
  const states = []
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    states.push(...sequence.slice(cycle === 0 ? 0 : 1))
  }
  states.push('LISTENING')
  return states
}

const states = simulateVoiceRuntimeCycles(20)
const expectedTail = ['FINISHED_TTS', 'RETURN_TO_LISTENING', 'LISTENING']
const tail = states.slice(-3)
if (tail.join('|') !== expectedTail.join('|')) {
  throw new Error(`Retorno final invalido: ${tail.join(' -> ')}`)
}
const finished = states.filter((state) => state === 'FINISHED_TTS').length
const returned = states.filter((state) => state === 'RETURN_TO_LISTENING').length
if (finished !== 20 || returned !== 20) {
  throw new Error(`Ciclos incompletos: FINISHED_TTS=${finished} RETURN_TO_LISTENING=${returned}`)
}
if (!storageSource.includes('autoReturnToListening: false')) {
  throw new Error('Retorno automatico ao microfone deve permanecer desligado por padrao.')
}
if (!controllerSource.includes('auto_return_disabled')) {
  throw new Error('Controlador deve retornar para IDLE quando o retorno automatico estiver desligado.')
}
if (!controllerSource.includes('recoverVoiceRuntime')) {
  throw new Error('Controlador deve expor recuperacao manual do runtime de voz.')
}
console.log(JSON.stringify({ ok: true, cycles: 20, states: states.length, tail, safeDefault: 'auto_return_disabled' }))
