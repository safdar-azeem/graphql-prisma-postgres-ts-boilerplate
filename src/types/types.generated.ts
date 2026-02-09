import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql'
export type Maybe<T> = T | null | undefined
export type InputMaybe<T> = T | null | undefined
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] }
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> }
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> }
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = {
  [_ in K]?: never
}
export type Incremental<T> =
  | T
  | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never }
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>
export type EnumResolverSignature<T, AllowedValues = any> = { [key in keyof T]?: AllowedValues }
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> }
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string | number }
  String: { input: string; output: string }
  Boolean: { input: boolean; output: boolean }
  Int: { input: number; output: number }
  Float: { input: number; output: number }
  Any: { input: any; output: any }
  DateTime: { input: Date | string; output: Date | string }
  JSON: { input: any; output: any }
  ObjectId: { input: any; output: any }
  Upload: { input: any; output: any }
}

export type AuthPayload = {
  __typename?: 'AuthPayload'
  token: Scalars['String']['output']
  user: User
}

export type CreateFolderInput = {
  isPublic?: InputMaybe<Scalars['Boolean']['input']>
  name: Scalars['String']['input']
  parentId?: InputMaybe<Scalars['String']['input']>
}

export type DateRangeInput = {
  from?: InputMaybe<Scalars['DateTime']['input']>
  to?: InputMaybe<Scalars['DateTime']['input']>
}

export type File = {
  __typename?: 'File'
  createdAt: Scalars['DateTime']['output']
  filename: Scalars['String']['output']
  folderId?: Maybe<Scalars['String']['output']>
  id: Scalars['ID']['output']
  isPublic: Scalars['Boolean']['output']
  mimeType: Scalars['String']['output']
  originalName: Scalars['String']['output']
  size: Scalars['Int']['output']
  status: FileStatus
  updatedAt: Scalars['DateTime']['output']
  url?: Maybe<Scalars['String']['output']>
}

export type FileConnection = {
  __typename?: 'FileConnection'
  items: Array<File>
  pageInfo: PaginationInfo
}

export type FileStatus = 'DELETED' | 'FAILED' | 'PENDING' | 'UPLOADED'

export type FilesFilterInput = {
  dateRange?: InputMaybe<DateRangeInput>
  folderId?: InputMaybe<Scalars['String']['input']>
  search?: InputMaybe<Scalars['String']['input']>
  uploadedBy?: InputMaybe<Scalars['String']['input']>
}

export type Folder = {
  __typename?: 'Folder'
  children?: Maybe<Array<Folder>>
  createdAt: Scalars['DateTime']['output']
  files?: Maybe<Array<File>>
  id: Scalars['ID']['output']
  isPublic: Scalars['Boolean']['output']
  name: Scalars['String']['output']
  parentId?: Maybe<Scalars['String']['output']>
  path: Scalars['String']['output']
  updatedAt: Scalars['DateTime']['output']
}

export type FolderConnection = {
  __typename?: 'FolderConnection'
  items: Array<Folder>
  pageInfo: PaginationInfo
}

export type FolderFilterInput = {
  parentId?: InputMaybe<Scalars['String']['input']>
  search?: InputMaybe<Scalars['String']['input']>
}

export type Init2faResponse = {
  __typename?: 'Init2faResponse'
  backupCodes: Array<Scalars['String']['output']>
  qrCode: Scalars['String']['output']
  secret: Scalars['String']['output']
}

export type LoginInput = {
  email: Scalars['String']['input']
  password: Scalars['String']['input']
}

export type MfaSettings = {
  __typename?: 'MfaSettings'
  isEnabled: Scalars['Boolean']['output']
  method?: Maybe<TwoFactorMethod>
}

export type Mutation = {
  __typename?: 'Mutation'
  cancelUpload: Scalars['Boolean']['output']
  confirm2faEnrollment: Scalars['Boolean']['output']
  confirmUpload: File
  createFolder: Folder
  createShareLink: ResourceShareLink
  deleteFiles: Scalars['String']['output']
  deleteFolder: Scalars['Boolean']['output']
  deleteShareLink: Scalars['Boolean']['output']
  disable2fa: Scalars['Boolean']['output']
  forgotPassword: Scalars['Boolean']['output']
  googleLogin: AuthPayload
  init2faEnrollment: Init2faResponse
  login: AuthPayload
  moveFolder: Folder
  renameFolder: Folder
  requestUploadUrl: SignedUploadUrl
  resetPassword: Scalars['Boolean']['output']
  signup: AuthPayload
  toggleFilePublic: File
  updateUserProfile: User
  verify2FA: AuthPayload
}

export type MutationcancelUploadArgs = {
  fileId: Scalars['ID']['input']
}

export type Mutationconfirm2faEnrollmentArgs = {
  otp: Scalars['String']['input']
}

export type MutationconfirmUploadArgs = {
  fileId: Scalars['ID']['input']
}

export type MutationcreateFolderArgs = {
  input: CreateFolderInput
}

export type MutationcreateShareLinkArgs = {
  input: ShareLinkInput
}

export type MutationdeleteFilesArgs = {
  ids: Array<Scalars['String']['input']>
}

export type MutationdeleteFolderArgs = {
  id: Scalars['ID']['input']
}

export type MutationdeleteShareLinkArgs = {
  id: Scalars['ID']['input']
}

export type Mutationdisable2faArgs = {
  password: Scalars['String']['input']
}

export type MutationforgotPasswordArgs = {
  email: Scalars['String']['input']
}

export type MutationgoogleLoginArgs = {
  token: Scalars['String']['input']
}

export type Mutationinit2faEnrollmentArgs = {
  method: TwoFactorMethod
}

export type MutationloginArgs = {
  data: LoginInput
}

export type MutationmoveFolderArgs = {
  id: Scalars['ID']['input']
  parentId?: InputMaybe<Scalars['String']['input']>
}

export type MutationrenameFolderArgs = {
  id: Scalars['ID']['input']
  name: Scalars['String']['input']
}

export type MutationrequestUploadUrlArgs = {
  input: RequestUploadInput
}

export type MutationresetPasswordArgs = {
  password: Scalars['String']['input']
  token: Scalars['String']['input']
}

export type MutationsignupArgs = {
  data: SignupInput
}

export type MutationtoggleFilePublicArgs = {
  id: Scalars['ID']['input']
}

export type MutationupdateUserProfileArgs = {
  data: UpdateUserProfileInput
}

export type Mutationverify2FAArgs = {
  otp: Scalars['String']['input']
  token: Scalars['String']['input']
}

export type PaginationInfo = {
  __typename?: 'PaginationInfo'
  currentPage: Scalars['Int']['output']
  totalItems: Scalars['Int']['output']
  totalPages: Scalars['Int']['output']
}

export type PaginationInput = {
  limit?: InputMaybe<Scalars['Int']['input']>
  page?: InputMaybe<Scalars['Int']['input']>
}

export type Query = {
  __typename?: 'Query'
  getFile?: Maybe<File>
  getFileDownloadUrl: Scalars['String']['output']
  getFileShareLinks: Array<ResourceShareLink>
  getFiles: FileConnection
  getFolder?: Maybe<Folder>
  getFolderShareLinks: Array<ResourceShareLink>
  getFolders: FolderConnection
  me?: Maybe<User>
}

export type QuerygetFileArgs = {
  id: Scalars['ID']['input']
}

export type QuerygetFileDownloadUrlArgs = {
  id: Scalars['ID']['input']
}

export type QuerygetFileShareLinksArgs = {
  fileId: Scalars['ID']['input']
}

export type QuerygetFilesArgs = {
  filter?: InputMaybe<FilesFilterInput>
  pagination?: InputMaybe<PaginationInput>
}

export type QuerygetFolderArgs = {
  id: Scalars['ID']['input']
}

export type QuerygetFolderShareLinksArgs = {
  folderId: Scalars['ID']['input']
}

export type QuerygetFoldersArgs = {
  filter?: InputMaybe<FolderFilterInput>
  pagination?: InputMaybe<PaginationInput>
}

export type RequestUploadInput = {
  filename: Scalars['String']['input']
  folderId?: InputMaybe<Scalars['String']['input']>
  isPublic?: InputMaybe<Scalars['Boolean']['input']>
  mimeType: Scalars['String']['input']
  size: Scalars['Int']['input']
}

export type ResourceShareLink = {
  __typename?: 'ResourceShareLink'
  createdAt: Scalars['DateTime']['output']
  expiresAt: Scalars['DateTime']['output']
  fileId?: Maybe<Scalars['String']['output']>
  folderId?: Maybe<Scalars['String']['output']>
  id: Scalars['ID']['output']
  token: Scalars['String']['output']
  url: Scalars['String']['output']
}

export type ShareLinkInput = {
  expiresInMinutes?: InputMaybe<Scalars['Int']['input']>
  fileId?: InputMaybe<Scalars['String']['input']>
  folderId?: InputMaybe<Scalars['String']['input']>
}

export type SignedUploadUrl = {
  __typename?: 'SignedUploadUrl'
  expiresAt: Scalars['DateTime']['output']
  fileId: Scalars['String']['output']
  publicUrl: Scalars['String']['output']
  signedUrl: Scalars['String']['output']
  storageKey: Scalars['String']['output']
}

export type SignupInput = {
  email: Scalars['String']['input']
  password: Scalars['String']['input']
  username: Scalars['String']['input']
}

export type TwoFactorMethod = 'AUTHENTICATOR' | 'EMAIL'

export type UpdateUserProfileInput = {
  avatar?: InputMaybe<Scalars['String']['input']>
  username?: InputMaybe<Scalars['String']['input']>
}

export type User = {
  __typename?: 'User'
  avatar?: Maybe<Scalars['String']['output']>
  createdAt: Scalars['DateTime']['output']
  email: Scalars['String']['output']
  id: Scalars['ID']['output']
  mfaSettings?: Maybe<MfaSettings>
  updatedAt: Scalars['DateTime']['output']
  username: Scalars['String']['output']
}

export type ResolverTypeWrapper<T> = Promise<T> | T

export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>
}
export type Resolver<
  TResult,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> =
  | ResolverFn<TResult, TParent, TContext, TArgs>
  | ResolverWithResolve<TResult, TParent, TContext, TArgs>

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>

export interface SubscriptionSubscriberObject<
  TResult,
  TKey extends string,
  TParent,
  TContext,
  TArgs,
> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>

export type SubscriptionResolver<
  TResult,
  TKey extends string,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>

export type TypeResolveFn<
  TTypes,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>

export type IsTypeOfResolverFn<
  T = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>

export type NextResolverFn<T> = () => Promise<T>

export type DirectiveResolverFn<
  TResult = Record<PropertyKey, never>,
  TParent = Record<PropertyKey, never>,
  TContext = Record<PropertyKey, never>,
  TArgs = Record<PropertyKey, never>,
> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>

/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  Any: ResolverTypeWrapper<Scalars['Any']['output']>
  AuthPayload: ResolverTypeWrapper<Omit<AuthPayload, 'user'> & { user: ResolversTypes['User'] }>
  String: ResolverTypeWrapper<Scalars['String']['output']>
  CreateFolderInput: CreateFolderInput
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>
  DateRangeInput: DateRangeInput
  DateTime: ResolverTypeWrapper<Scalars['DateTime']['output']>
  File: ResolverTypeWrapper<Omit<File, 'status'> & { status: ResolversTypes['FileStatus'] }>
  ID: ResolverTypeWrapper<Scalars['ID']['output']>
  Int: ResolverTypeWrapper<Scalars['Int']['output']>
  FileConnection: ResolverTypeWrapper<
    Omit<FileConnection, 'items'> & { items: Array<ResolversTypes['File']> }
  >
  FileStatus: ResolverTypeWrapper<'PENDING' | 'UPLOADED' | 'FAILED' | 'DELETED'>
  FilesFilterInput: FilesFilterInput
  Folder: ResolverTypeWrapper<
    Omit<Folder, 'children' | 'files'> & {
      children?: Maybe<Array<ResolversTypes['Folder']>>
      files?: Maybe<Array<ResolversTypes['File']>>
    }
  >
  FolderConnection: ResolverTypeWrapper<
    Omit<FolderConnection, 'items'> & { items: Array<ResolversTypes['Folder']> }
  >
  FolderFilterInput: FolderFilterInput
  Init2faResponse: ResolverTypeWrapper<Init2faResponse>
  JSON: ResolverTypeWrapper<Scalars['JSON']['output']>
  LoginInput: LoginInput
  MfaSettings: ResolverTypeWrapper<
    Omit<MfaSettings, 'method'> & { method?: Maybe<ResolversTypes['TwoFactorMethod']> }
  >
  Mutation: ResolverTypeWrapper<Record<PropertyKey, never>>
  ObjectId: ResolverTypeWrapper<Scalars['ObjectId']['output']>
  PaginationInfo: ResolverTypeWrapper<PaginationInfo>
  PaginationInput: PaginationInput
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>
  RequestUploadInput: RequestUploadInput
  ResourceShareLink: ResolverTypeWrapper<ResourceShareLink>
  ShareLinkInput: ShareLinkInput
  SignedUploadUrl: ResolverTypeWrapper<SignedUploadUrl>
  SignupInput: SignupInput
  TwoFactorMethod: ResolverTypeWrapper<'EMAIL' | 'AUTHENTICATOR'>
  UpdateUserProfileInput: UpdateUserProfileInput
  Upload: ResolverTypeWrapper<Scalars['Upload']['output']>
  User: ResolverTypeWrapper<
    Omit<User, 'mfaSettings'> & { mfaSettings?: Maybe<ResolversTypes['MfaSettings']> }
  >
}

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  Any: Scalars['Any']['output']
  AuthPayload: Omit<AuthPayload, 'user'> & { user: ResolversParentTypes['User'] }
  String: Scalars['String']['output']
  CreateFolderInput: CreateFolderInput
  Boolean: Scalars['Boolean']['output']
  DateRangeInput: DateRangeInput
  DateTime: Scalars['DateTime']['output']
  File: File
  ID: Scalars['ID']['output']
  Int: Scalars['Int']['output']
  FileConnection: Omit<FileConnection, 'items'> & { items: Array<ResolversParentTypes['File']> }
  FilesFilterInput: FilesFilterInput
  Folder: Omit<Folder, 'children' | 'files'> & {
    children?: Maybe<Array<ResolversParentTypes['Folder']>>
    files?: Maybe<Array<ResolversParentTypes['File']>>
  }
  FolderConnection: Omit<FolderConnection, 'items'> & {
    items: Array<ResolversParentTypes['Folder']>
  }
  FolderFilterInput: FolderFilterInput
  Init2faResponse: Init2faResponse
  JSON: Scalars['JSON']['output']
  LoginInput: LoginInput
  MfaSettings: MfaSettings
  Mutation: Record<PropertyKey, never>
  ObjectId: Scalars['ObjectId']['output']
  PaginationInfo: PaginationInfo
  PaginationInput: PaginationInput
  Query: Record<PropertyKey, never>
  RequestUploadInput: RequestUploadInput
  ResourceShareLink: ResourceShareLink
  ShareLinkInput: ShareLinkInput
  SignedUploadUrl: SignedUploadUrl
  SignupInput: SignupInput
  UpdateUserProfileInput: UpdateUserProfileInput
  Upload: Scalars['Upload']['output']
  User: Omit<User, 'mfaSettings'> & { mfaSettings?: Maybe<ResolversParentTypes['MfaSettings']> }
}

export interface AnyScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['Any'], any> {
  name: 'Any'
}

export type AuthPayloadResolvers<
  ContextType = any,
  ParentType extends ResolversParentTypes['AuthPayload'] = ResolversParentTypes['AuthPayload'],
> = {
  token?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  user?: Resolver<ResolversTypes['User'], ParentType, ContextType>
}

export interface DateTimeScalarConfig extends GraphQLScalarTypeConfig<
  ResolversTypes['DateTime'],
  any
> {
  name: 'DateTime'
}

export type FileResolvers<
  ContextType = any,
  ParentType extends ResolversParentTypes['File'] = ResolversParentTypes['File'],
> = {
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>
  filename?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  folderId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  isPublic?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  mimeType?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  originalName?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  size?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  status?: Resolver<ResolversTypes['FileStatus'], ParentType, ContextType>
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>
  url?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
}

export type FileConnectionResolvers<
  ContextType = any,
  ParentType extends ResolversParentTypes['FileConnection'] =
    ResolversParentTypes['FileConnection'],
> = {
  items?: Resolver<Array<ResolversTypes['File']>, ParentType, ContextType>
  pageInfo?: Resolver<ResolversTypes['PaginationInfo'], ParentType, ContextType>
}

export type FileStatusResolvers = EnumResolverSignature<
  { DELETED?: any; FAILED?: any; PENDING?: any; UPLOADED?: any },
  ResolversTypes['FileStatus']
>

export type FolderResolvers<
  ContextType = any,
  ParentType extends ResolversParentTypes['Folder'] = ResolversParentTypes['Folder'],
> = {
  children?: Resolver<Maybe<Array<ResolversTypes['Folder']>>, ParentType, ContextType>
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>
  files?: Resolver<Maybe<Array<ResolversTypes['File']>>, ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  isPublic?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  parentId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  path?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>
}

export type FolderConnectionResolvers<
  ContextType = any,
  ParentType extends ResolversParentTypes['FolderConnection'] =
    ResolversParentTypes['FolderConnection'],
> = {
  items?: Resolver<Array<ResolversTypes['Folder']>, ParentType, ContextType>
  pageInfo?: Resolver<ResolversTypes['PaginationInfo'], ParentType, ContextType>
}

export type Init2faResponseResolvers<
  ContextType = any,
  ParentType extends ResolversParentTypes['Init2faResponse'] =
    ResolversParentTypes['Init2faResponse'],
> = {
  backupCodes?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>
  qrCode?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  secret?: Resolver<ResolversTypes['String'], ParentType, ContextType>
}

export interface JSONScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['JSON'], any> {
  name: 'JSON'
}

export type MfaSettingsResolvers<
  ContextType = any,
  ParentType extends ResolversParentTypes['MfaSettings'] = ResolversParentTypes['MfaSettings'],
> = {
  isEnabled?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  method?: Resolver<Maybe<ResolversTypes['TwoFactorMethod']>, ParentType, ContextType>
}

export type MutationResolvers<
  ContextType = any,
  ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation'],
> = {
  cancelUpload?: Resolver<
    ResolversTypes['Boolean'],
    ParentType,
    ContextType,
    RequireFields<MutationcancelUploadArgs, 'fileId'>
  >
  confirm2faEnrollment?: Resolver<
    ResolversTypes['Boolean'],
    ParentType,
    ContextType,
    RequireFields<Mutationconfirm2faEnrollmentArgs, 'otp'>
  >
  confirmUpload?: Resolver<
    ResolversTypes['File'],
    ParentType,
    ContextType,
    RequireFields<MutationconfirmUploadArgs, 'fileId'>
  >
  createFolder?: Resolver<
    ResolversTypes['Folder'],
    ParentType,
    ContextType,
    RequireFields<MutationcreateFolderArgs, 'input'>
  >
  createShareLink?: Resolver<
    ResolversTypes['ResourceShareLink'],
    ParentType,
    ContextType,
    RequireFields<MutationcreateShareLinkArgs, 'input'>
  >
  deleteFiles?: Resolver<
    ResolversTypes['String'],
    ParentType,
    ContextType,
    RequireFields<MutationdeleteFilesArgs, 'ids'>
  >
  deleteFolder?: Resolver<
    ResolversTypes['Boolean'],
    ParentType,
    ContextType,
    RequireFields<MutationdeleteFolderArgs, 'id'>
  >
  deleteShareLink?: Resolver<
    ResolversTypes['Boolean'],
    ParentType,
    ContextType,
    RequireFields<MutationdeleteShareLinkArgs, 'id'>
  >
  disable2fa?: Resolver<
    ResolversTypes['Boolean'],
    ParentType,
    ContextType,
    RequireFields<Mutationdisable2faArgs, 'password'>
  >
  forgotPassword?: Resolver<
    ResolversTypes['Boolean'],
    ParentType,
    ContextType,
    RequireFields<MutationforgotPasswordArgs, 'email'>
  >
  googleLogin?: Resolver<
    ResolversTypes['AuthPayload'],
    ParentType,
    ContextType,
    RequireFields<MutationgoogleLoginArgs, 'token'>
  >
  init2faEnrollment?: Resolver<
    ResolversTypes['Init2faResponse'],
    ParentType,
    ContextType,
    RequireFields<Mutationinit2faEnrollmentArgs, 'method'>
  >
  login?: Resolver<
    ResolversTypes['AuthPayload'],
    ParentType,
    ContextType,
    RequireFields<MutationloginArgs, 'data'>
  >
  moveFolder?: Resolver<
    ResolversTypes['Folder'],
    ParentType,
    ContextType,
    RequireFields<MutationmoveFolderArgs, 'id'>
  >
  renameFolder?: Resolver<
    ResolversTypes['Folder'],
    ParentType,
    ContextType,
    RequireFields<MutationrenameFolderArgs, 'id' | 'name'>
  >
  requestUploadUrl?: Resolver<
    ResolversTypes['SignedUploadUrl'],
    ParentType,
    ContextType,
    RequireFields<MutationrequestUploadUrlArgs, 'input'>
  >
  resetPassword?: Resolver<
    ResolversTypes['Boolean'],
    ParentType,
    ContextType,
    RequireFields<MutationresetPasswordArgs, 'password' | 'token'>
  >
  signup?: Resolver<
    ResolversTypes['AuthPayload'],
    ParentType,
    ContextType,
    RequireFields<MutationsignupArgs, 'data'>
  >
  toggleFilePublic?: Resolver<
    ResolversTypes['File'],
    ParentType,
    ContextType,
    RequireFields<MutationtoggleFilePublicArgs, 'id'>
  >
  updateUserProfile?: Resolver<
    ResolversTypes['User'],
    ParentType,
    ContextType,
    RequireFields<MutationupdateUserProfileArgs, 'data'>
  >
  verify2FA?: Resolver<
    ResolversTypes['AuthPayload'],
    ParentType,
    ContextType,
    RequireFields<Mutationverify2FAArgs, 'otp' | 'token'>
  >
}

export interface ObjectIdScalarConfig extends GraphQLScalarTypeConfig<
  ResolversTypes['ObjectId'],
  any
> {
  name: 'ObjectId'
}

export type PaginationInfoResolvers<
  ContextType = any,
  ParentType extends ResolversParentTypes['PaginationInfo'] =
    ResolversParentTypes['PaginationInfo'],
> = {
  currentPage?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  totalItems?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  totalPages?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
}

export type QueryResolvers<
  ContextType = any,
  ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query'],
> = {
  getFile?: Resolver<
    Maybe<ResolversTypes['File']>,
    ParentType,
    ContextType,
    RequireFields<QuerygetFileArgs, 'id'>
  >
  getFileDownloadUrl?: Resolver<
    ResolversTypes['String'],
    ParentType,
    ContextType,
    RequireFields<QuerygetFileDownloadUrlArgs, 'id'>
  >
  getFileShareLinks?: Resolver<
    Array<ResolversTypes['ResourceShareLink']>,
    ParentType,
    ContextType,
    RequireFields<QuerygetFileShareLinksArgs, 'fileId'>
  >
  getFiles?: Resolver<
    ResolversTypes['FileConnection'],
    ParentType,
    ContextType,
    Partial<QuerygetFilesArgs>
  >
  getFolder?: Resolver<
    Maybe<ResolversTypes['Folder']>,
    ParentType,
    ContextType,
    RequireFields<QuerygetFolderArgs, 'id'>
  >
  getFolderShareLinks?: Resolver<
    Array<ResolversTypes['ResourceShareLink']>,
    ParentType,
    ContextType,
    RequireFields<QuerygetFolderShareLinksArgs, 'folderId'>
  >
  getFolders?: Resolver<
    ResolversTypes['FolderConnection'],
    ParentType,
    ContextType,
    Partial<QuerygetFoldersArgs>
  >
  me?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>
}

export type ResourceShareLinkResolvers<
  ContextType = any,
  ParentType extends ResolversParentTypes['ResourceShareLink'] =
    ResolversParentTypes['ResourceShareLink'],
> = {
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>
  expiresAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>
  fileId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  folderId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  token?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  url?: Resolver<ResolversTypes['String'], ParentType, ContextType>
}

export type SignedUploadUrlResolvers<
  ContextType = any,
  ParentType extends ResolversParentTypes['SignedUploadUrl'] =
    ResolversParentTypes['SignedUploadUrl'],
> = {
  expiresAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>
  fileId?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  publicUrl?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  signedUrl?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  storageKey?: Resolver<ResolversTypes['String'], ParentType, ContextType>
}

export type TwoFactorMethodResolvers = EnumResolverSignature<
  { AUTHENTICATOR?: any; EMAIL?: any },
  ResolversTypes['TwoFactorMethod']
>

export interface UploadScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['Upload'], any> {
  name: 'Upload'
}

export type UserResolvers<
  ContextType = any,
  ParentType extends ResolversParentTypes['User'] = ResolversParentTypes['User'],
> = {
  avatar?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  createdAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>
  email?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  mfaSettings?: Resolver<Maybe<ResolversTypes['MfaSettings']>, ParentType, ContextType>
  updatedAt?: Resolver<ResolversTypes['DateTime'], ParentType, ContextType>
  username?: Resolver<ResolversTypes['String'], ParentType, ContextType>
}

export type Resolvers<ContextType = any> = {
  Any?: GraphQLScalarType
  AuthPayload?: AuthPayloadResolvers<ContextType>
  DateTime?: GraphQLScalarType
  File?: FileResolvers<ContextType>
  FileConnection?: FileConnectionResolvers<ContextType>
  FileStatus?: FileStatusResolvers
  Folder?: FolderResolvers<ContextType>
  FolderConnection?: FolderConnectionResolvers<ContextType>
  Init2faResponse?: Init2faResponseResolvers<ContextType>
  JSON?: GraphQLScalarType
  MfaSettings?: MfaSettingsResolvers<ContextType>
  Mutation?: MutationResolvers<ContextType>
  ObjectId?: GraphQLScalarType
  PaginationInfo?: PaginationInfoResolvers<ContextType>
  Query?: QueryResolvers<ContextType>
  ResourceShareLink?: ResourceShareLinkResolvers<ContextType>
  SignedUploadUrl?: SignedUploadUrlResolvers<ContextType>
  TwoFactorMethod?: TwoFactorMethodResolvers
  Upload?: GraphQLScalarType
  User?: UserResolvers<ContextType>
}
