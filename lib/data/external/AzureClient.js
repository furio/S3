const { errors } = require('arsenal');
const azure = require('azure-storage');
const createLogger = require('../multipleBackendLogger');
const logHelper = require('./utils').logHelper;

class AzureClient {
    constructor(config) {
        this._azureBlobEndpoint = config.azureBlobEndpoint;
        this._azureBlobSAS = config.azureBlobSAS;
        this._azureContainerName = config.azureContainerName;
        this._client = azure.createBlobServiceWithSas(
          this._azureBlobEndpoint, this._azureBlobSAS);
        this._dataStoreName = config.dataStoreName;
        this._bucketMatch = config.bucketMatch;
    }

    _createAzureKey(requestBucketName, requestObjectKey,
        bucketMatch) {
        if (bucketMatch) {
            return requestObjectKey;
        }
        return `${requestBucketName}/${requestObjectKey}`;
    }

    _translateMetaHeaders(metaHeaders) {
        const translatedMetaHeaders = {};
        Object.keys(metaHeaders).forEach(headerName => {
            const translated = headerName.replace(/-/g, '_');
            translatedMetaHeaders[translated] = metaHeaders[headerName];
        });
        return translatedMetaHeaders;
    }

    put(stream, size, keyContext, reqUids, callback) {
        const azureKey = this._createAzureKey(keyContext.bucketName,
           keyContext.objectKey, this._bucketMatch);
        const options = { metadata:
          this._translateMetaHeaders(keyContext.metaHeaders) };
        this._client.createBlockBlobFromStream(this._azureContainerName,
          azureKey, stream, size, options, err => {
              if (err) {
                  const log = createLogger(reqUids);
                  logHelper(log, 'error', 'err from Azure PUT data backend',
                    err, this._dataStoreName);
                  return callback(errors.InternalError
                    .customizeDescription('Error returned from ' +
                    `Azure: ${err.message}`)
                  );
              }
              return callback(null, azureKey);
          });
    }

    get(objectGetInfo, range, reqUids, callback) {
        // for backwards compatibility
        const key = typeof(objectGetInfo) === 'string' ? objectGetInfo :
          objectGetInfo.key;
        const response = objectGetInfo.response;
        const azureStreamingOptions = objectGetInfo.azureStreamingOptions;
        this._client.getBlobToStream(this._azureContainerName, key, response,
          azureStreamingOptions, err => {
              if (err) {
                  const log = createLogger(reqUids);
                  logHelper(log, 'error', 'err from Azure GET data backend',
                    err, this._dataStoreName);
                  return callback(errors.InternalError);
              }
              return callback();
          });
    }

    delete(objectGetInfo, reqUids, callback) {
        // for backwards compatibility
        const key = typeof(objectGetInfo) === 'string' ? objectGetInfo :
          objectGetInfo.key;
        return this._client.deleteBlob(this._azureContainerName, key,
        err => {
            if (err) {
                const log = createLogger(reqUids);
                logHelper(log, 'error', 'error deleting object from ' +
                  'Azure datastore', err, this._dataStoreName);
                return callback(errors.InternalError
                  .customizeDescription('Error returned from ' +
                  `Azure: ${err.message}`));
            }
            return callback();
        });
    }

    checkAzureHealth(location, callback) {
        const azureResp = {};
        this._client.doesContainerExist(this._azureContainerName, err => {
            /* eslint-disable no-param-reassign */
            if (err) {
                azureResp[location] = { error: err.message };
                return callback(null, azureResp);
            }
            azureResp[location] = {
                message: 'Congrats! You own the azure container',
            };
            return callback(null, azureResp);
        });
    }
}

module.exports = AzureClient;
