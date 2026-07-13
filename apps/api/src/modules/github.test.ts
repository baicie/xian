import { describe, expect, it } from 'vitest'
import { decryptSecret, encryptSecret, parseGitHubRepo } from './github.js'

describe('GitHub integration helpers',()=>{
  it('round-trips a token without storing it in ciphertext',()=>{const secret='github_pat_sensitive-value',key=Buffer.alloc(32,7),encrypted=encryptSecret(secret,key);expect(encrypted.ciphertext).not.toContain(secret);expect(decryptSecret(encrypted,key)).toBe(secret)})
  it('accepts canonical GitHub repository URLs only',()=>{expect(parseGitHubRepo('https://github.com/baicie/task-harbor')).toEqual({owner:'baicie',repo:'task-harbor'});expect(()=>parseGitHubRepo('https://evil.example/repo')).toThrow()})
})
