import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

function gitCommit(fallback?:string) {
  if(fallback)return fallback
  try{return execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()}catch{return'unknown'}
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '../..'), '')
  const apiPort = Number(process.env.PORT ?? env.PORT ?? 8080)
  const webPort = Number(process.env.WEB_PORT ?? env.WEB_PORT ?? 5173)

  return {
    plugins: [react(), tailwindcss()],
    define: { __APP_COMMIT__: JSON.stringify(gitCommit(env.APP_COMMIT)) },
    resolve: { alias: { '@': path.resolve(__dirname, './src') } },
    build: {
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              {
                name: 'plate-editor',
                test: /[\\/]node_modules[\\/](?:@platejs|platejs|slate|slate-dom|slate-hyperscript|slate-react)[\\/]/,
                priority: 20,
                minSize: 100_000,
                maxSize: 400_000,
              },
              {
                name: 'vendor',
                test: /[\\/]node_modules[\\/]/,
                priority: 10,
                minSize: 100_000,
                maxSize: 400_000,
              },
            ],
          },
        },
      },
    },
    server: {
      port: webPort,
      strictPort: true,
      proxy: { '/api': `http://localhost:${apiPort}` },
    },
  }
})
