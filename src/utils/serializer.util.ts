import superjson from 'superjson'

export const serialize = (data: any): string => {
  return superjson.stringify(data)
}

export const deserialize = <T>(data: string): T | null => {
  try {
    const result = superjson.parse<T>(data)
    return result ?? null
  } catch (error) {
    return null
  }
}
