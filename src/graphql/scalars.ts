import { GraphQLScalarType, Kind } from 'graphql'

export const DateTimeResolver = new GraphQLScalarType({
  name: 'DateTime',
  description: 'DateTime custom scalar type',
  parseValue(value: any) {
    return new Date(value) // value from the client
  },
  serialize(value: any) {
    return value.toISOString() // value sent to the client
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return new Date(ast.value) // ast value is always in string format
    }
    return null
  },
})

// Export simple object for merging
export const scalars = {
  DateTime: DateTimeResolver,
}
