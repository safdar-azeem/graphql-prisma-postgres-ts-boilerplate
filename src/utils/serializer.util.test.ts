import { serialize, deserialize } from './serializer.util'
import { describe, it, expect } from 'vitest'

describe('Serializer Utils', () => {
  it('should serialize an object', () => {
    const data = { foo: 'bar', date: new Date('2023-01-01T00:00:00.000Z') }
    const serialized = serialize(data)
    expect(typeof serialized).toBe('string')
    expect(serialized).toContain('bar')
  })

  it('should deserialize a string', () => {
    const data = { foo: 'bar', date: new Date('2023-01-01T00:00:00.000Z') }
    const serialized = serialize(data)
    const deserialized = deserialize(serialized)
    expect(deserialized).toEqual(data)
  })

  it('should return null for invalid JSON', () => {
    const deserialized = deserialize('invalid-json')
    expect(deserialized).toBeNull()
  })
})
