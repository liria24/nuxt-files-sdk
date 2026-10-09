import type { AdapterCapabilities } from 'files-sdk'

/** Copy only native capability fields; never serialize adapter/plugin additions. */
export const filesDevtoolsCapabilities = (caps: AdapterCapabilities): AdapterCapabilities => ({
    cacheControl: caps.cacheControl,
    conditional: {
        create: caps.conditional.create,
        replace: caps.conditional.replace,
        exactRead: caps.conditional.exactRead,
        delete: caps.conditional.delete,
        copy: {
            sourceEtag: caps.conditional.copy.sourceEtag,
            atomicSourceDestination: caps.conditional.copy.atomicSourceDestination,
            destinationCreate: caps.conditional.copy.destinationCreate,
            destinationReplace: caps.conditional.copy.destinationReplace,
        },
        multipart: { create: caps.conditional.multipart.create, replace: caps.conditional.multipart.replace },
    },
    delimiter: caps.delimiter,
    events: caps.events ? { format: caps.events.format } : false,
    metadata: caps.metadata,
    publicUrl: caps.publicUrl,
    rangeRead: caps.rangeRead,
    resumable: caps.resumable,
    serverSideCopy: caps.serverSideCopy,
    signedUpload: {
        supported: caps.signedUpload.supported,
        contentType: caps.signedUpload.contentType,
        maxSize: caps.signedUpload.maxSize,
        ...(caps.signedUpload.maxExpiresIn === undefined ? {} : { maxExpiresIn: caps.signedUpload.maxExpiresIn }),
    },
    signedUrl: {
        supported: caps.signedUrl.supported,
        expiry: caps.signedUrl.expiry,
        disposition: caps.signedUrl.disposition,
        ...(caps.signedUrl.maxExpiresIn === undefined ? {} : { maxExpiresIn: caps.signedUrl.maxExpiresIn }),
    },
    uploadProgress: caps.uploadProgress,
})
