import { Router } from 'express'
import uploadRoutes from './upload.routes.js'
import fileRoutes from './file.routes.js'
import folderRoutes from './folder.routes.js'
import localUploadRoutes from './local-upload.routes.js'
import shareLinkRoutes from './share-link.routes.js'
import shareRoutes from './share.routes.js'

const router = Router()

router.use('/upload', uploadRoutes)
router.use('/files', fileRoutes)
router.use('/folders', folderRoutes)
router.use('/local', localUploadRoutes)
router.use('/share-links', shareLinkRoutes)
router.use('/share', shareRoutes)

export default router
