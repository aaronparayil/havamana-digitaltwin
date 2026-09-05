import { spawn } from 'child_process'
import { existsSync } from 'fs'

// Determine Python command for Windows / cross-platform
const winPy311 = 'C:\\Users\\Abhay\\AppData\\Local\\Programs\\Python\\Python311\\python.exe'
let pyCmd = 'py'

if (process.platform === 'win32') {
  if (!existsSync(winPy311)) {
    pyCmd = 'python'
  }
} else {
  pyCmd = 'python3'
}

console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════════════════════')
console.log('\x1b[36m%s\x1b[0m', '⚡ Starting HavaMana Fullstack (Vite UI + Climate Neural API)')
console.log('\x1b[36m%s\x1b[0m', '═══════════════════════════════════════════════════════════\n')

// 1. Launch Flask Backend API
console.log('\x1b[33m%s\x1b[0m', `[API] Spawning backend service (${pyCmd} -m backend.api.app)...`)
const backend = spawn(pyCmd, ['-m', 'backend.api.app'], {
  stdio: 'inherit',
  shell: true,
  cwd: process.cwd()
})

// 2. Launch Vite Frontend Dev Server
console.log('\x1b[32m%s\x1b[0m', '[VITE] Spawning Vite development server...\n')
const viteCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const frontend = spawn(viteCmd, ['vite'], {
  stdio: 'inherit',
  shell: true,
  cwd: process.cwd()
})

// 3. Clean process termination on exit (Ctrl+C)
let exiting = false
const cleanExit = () => {
  if (exiting) return
  exiting = true
  console.log('\n\x1b[33m%s\x1b[0m', '🛑 Stopping HavaMana development servers...')

  if (process.platform === 'win32') {
    if (backend.pid) {
      try { spawn('taskkill', ['/pid', backend.pid.toString(), '/f', '/t'], { stdio: 'ignore' }) } catch (_) {}
    }
    if (frontend.pid) {
      try { spawn('taskkill', ['/pid', frontend.pid.toString(), '/f', '/t'], { stdio: 'ignore' }) } catch (_) {}
    }
  } else {
    try { backend.kill('SIGINT') } catch (_) {}
    try { frontend.kill('SIGINT') } catch (_) {}
  }

  setTimeout(() => process.exit(0), 500)
}

process.on('SIGINT', cleanExit)
process.on('SIGTERM', cleanExit)
backend.on('exit', (code) => {
  if (!exiting && code !== 0 && code !== null) {
    console.error(`\x1b[31m[API] Backend process exited unexpectedly with code ${code}\x1b[0m`)
  }
})
