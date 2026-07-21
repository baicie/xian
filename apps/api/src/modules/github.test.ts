import { describe, expect, it, vi } from 'vitest'
import {
  decryptSecret,
  encryptSecret,
  GitHubService,
  githubHttpError,
  githubNetworkError,
  parseGitHubRepo,
  toGitHubReference,
} from './github.js'

describe('GitHub integration helpers', () => {
  it('round-trips a token without storing it in ciphertext', () => {
    const secret = 'github_pat_sensitive-value',
      key = Buffer.alloc(32, 7),
      encrypted = encryptSecret(secret, key)
    expect(encrypted.ciphertext).not.toContain(secret)
    expect(decryptSecret(encrypted, key)).toBe(secret)
  })
  it('accepts canonical GitHub repository URLs only', () => {
    expect(parseGitHubRepo('https://github.com/baicie/task-harbor')).toEqual({
      owner: 'baicie',
      repo: 'task-harbor',
    })
    expect(() => parseGitHubRepo('https://evil.example/repo')).toThrow()
  })
  it('distinguishes issues and pull requests from the issues API', () => {
    expect(
      toGitHubReference(
        { number: 12, title: 'Fix login', body: null, state: 'open', labels: [] },
        'acme',
        'app',
      ),
    ).toMatchObject({ kind: 'ISSUE', url: 'https://github.com/acme/app/issues/12' })
    expect(
      toGitHubReference(
        {
          number: 13,
          title: 'Ship fix',
          body: null,
          state: 'closed',
          labels: [],
          pull_request: {},
        },
        'acme',
        'app',
      ),
    ).toMatchObject({ kind: 'PR', url: 'https://github.com/acme/app/pull/13' })
  })
  it('classifies GitHub authentication and repository errors', () => {
    expect(githubHttpError(401, null).code).toBe('GITHUB_TOKEN_INVALID')
    expect(githubHttpError(403, '0').code).toBe('GITHUB_RATE_LIMITED')
    expect(githubHttpError(403, '42').code).toBe('GITHUB_ACCESS_DENIED')
    expect(githubHttpError(404, null).code).toBe('GITHUB_REPOSITORY_NOT_FOUND')
  })
  it('classifies timeout and other network failures', () => {
    expect(githubNetworkError(new DOMException('timed out', 'TimeoutError')).code).toBe(
      'GITHUB_TIMEOUT',
    )
    expect(githubNetworkError(new TypeError('fetch failed')).code).toBe('GITHUB_UNREACHABLE')
  })
  it('paginates issue lists until GitHub returns a partial page', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const page = new URL(String(input)).searchParams.get('page'),
        count = page === '1' ? 100 : 1
      return new Response(
        JSON.stringify(
          Array.from({ length: count }, (_, index) => ({
            number: (page === '1' ? 0 : 100) + index + 1,
            title: 'Task',
            body: null,
            state: 'open',
            labels: [],
          })),
        ),
        { status: 200 },
      )
    })
    try {
      const service = new GitHubService({} as never, {} as never),
        items = await (
          service as unknown as {
            githubPages(
              token: string,
              owner: string,
              repo: string,
              path: string,
            ): Promise<unknown[]>
          }
        ).githubPages('token', 'acme', 'app', '/issues?state=all&per_page=100')
      expect(items).toHaveLength(101)
      expect(fetchMock).toHaveBeenCalledTimes(2)
    } finally {
      fetchMock.mockRestore()
    }
  })
})
