import { describe, it, expect } from 'vitest'
import {
  validateWorkspaceName,
  validateWorkspaceSlug,
} from '@/modules/workspace/services/workspace.service'
import { ValidationError } from '@/errors'

describe('workspace validation', () => {
  it('rejects empty or short workspace names', () => {
    expect(() => validateWorkspaceName('')).toThrow(ValidationError)
    expect(() => validateWorkspaceName('a')).toThrow(ValidationError)
  })

  it('rejects reserved slugs', () => {
    expect(() => validateWorkspaceSlug('admin')).toThrow(/reserved/i)
    expect(() => validateWorkspaceSlug('api')).toThrow(/reserved/i)
  })

  it('accepts valid slugified names', () => {
    expect(validateWorkspaceSlug('Acme Corp')).toBe('acme-corp')
  })
})
