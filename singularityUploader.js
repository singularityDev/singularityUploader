var singularityUploader =
    {
        instances: [],

        /**
         *  Creates the uploader interface
         * @param {String} targetId A valid container where the uploader will be created
         * @param {Object} options
         * @return {Number} An instance id (Starting with 0!) on success or -1 on failure.
         */
        create: function(targetId, options)
        {
            var container = document.getElementById(targetId);

            if(!container)
            {
                console.log('Uploader Error: Invalid target!');
                return -1;
            }

            if(this.util.hasClass(container, '_sg-uploader-container'))
            {
                console.log('Duplicate instance!');
                var instance = container.getAttribute('data-instance-id');
                return (instance !== null ? Number(instance) : -1);
            }

            options = options || {};

            options = this.util.extend(true, {
                transferDestination:'',
                allowedFileExtensions:[],
                maxFileSize:null,
                maxConcurentTransfers: 5,
                maxFileChunkSize: 2097152, // NOTE: bytes per data chunk
                multipleFiles:false,
                sessionName: 'singularityUpload', //NOTE: The session name that the php script will use to store uploaded files
                maxRetries: 3,
                success:null,
                error:null,
                uploadButtonText: 'Upload'
            }, options);

            var uploader = document.createElement('input');
            uploader.setAttribute('type', 'file');
            uploader.setAttribute('class', '_sg-uploader-input');
            if(options.multipleFiles)
            {
                uploader.setAttribute('multiple', 'multiple');
            }

            if(options.allowedFileExtensions.length)
            {
                uploader.setAttribute('accept', '.' + options.allowedFileExtensions.join(',.'))
            }

            uploader.options = options;
            uploader.fileQueue = [];
            uploader.chunksQueue = [];
            uploader.fileErrors = {};
            uploader.errors = 0;
            uploader.totalFileChunks = 0;
            uploader.totalUploadedChunks = 0;
            uploader.activeTransfers = 0;
            uploader.waitingActiveTransfers = {
                waitingFinalTransfers: false
            };
            uploader.handleError = this.handleError;
            uploader.initTransfer = this.initTransfer;
            uploader.transferFile = this.transferFile;
            uploader.onchange = this.processInputFiles;
            uploader.updateFileProgress = this.updateFileProgress;
            uploader.updateOverallProgress = this.updateOverallProgress;
            uploader.updateFileStatus = this.updateFileStatus;
            uploader.fileHasErrors = this.fileHasErrors;
            var instanceId = (this.instances.push(uploader) - 1);
            uploader.instanceId = instanceId;

            container.appendChild(uploader);
            container.classList.add('_sg-uploader-container');
            container.setAttribute('data-instance-id', instanceId);

            return instanceId;
        },

        /**
         * @param {Number} instanceId
         * @returns {Object|undefined}
         */
        getInstance: function(instanceId)
        {
            return this.instances[instanceId];
        },

        processInputFiles: function()
        {
            var fileList,
                initFileList;
            if(this.fileList)
            {
                fileList = this.fileList;
                fileList.innerHTML = '';
                initFileList = false;
                this.totalFileChunks = 0;
                this.totalUploadedChunks = 0;
            }
            else
            {
                fileList = document.createElement('ul');
                initFileList = true;
            }

            if(!fileList)
            {
                return;
            }

            var liElem,
                checkbox,
                checkboxLabel,
                currentFile,
                totalFileChunks,
                chunksQueue,
                fileStatus,
                chunkDataStart,
                uploader = this,
                fileIndex = 0,
                maxChunkSize = uploader.options.maxFileChunkSize,
                chunkId = 0,
                files = uploader.files,
                fileCount = files.length,
                instanceId = uploader.instanceId,
                addRemoveFileFromQueue = function()
                {
                    if(this.checked)
                    {
                        uploader.fileQueue.push(this.fileIndex);
                    }
                    else
                    {
                        uploader.fileQueue.splice(this.fileIndex, 1);
                    }
                };

            for(; fileIndex < fileCount; ++fileIndex)
            {
                currentFile = files[fileIndex];
                liElem = document.createElement('li');
                fileStatus = document.createElement('div');

                checkboxLabel = document.createElement('label');
                checkboxLabel.innerHTML = '&nbsp; ' + currentFile.name;
                checkboxLabel.setAttribute('for', '_sg-uploader-fileStatusCheckbox' + instanceId + fileIndex);
                checkboxLabel.setAttribute('class', '_sg-uploader-fileStatusCheckbox');

                checkbox = document.createElement('input');
                checkbox.setAttribute('type', 'checkbox');
                checkbox.setAttribute('id', '_sg-uploader-fileStatusCheckbox' + instanceId + fileIndex);
                checkbox.fileIndex = fileIndex;
                checkbox.checked = true;
                checkbox.onchange = addRemoveFileFromQueue;

                totalFileChunks = Math.ceil(currentFile.size / maxChunkSize);
                uploader.totalFileChunks += totalFileChunks;

                if(totalFileChunks < 2)
                {
                    uploader.chunksQueue[fileIndex] = [{
                        chunkId: 0,
                        retries: 0,
                        totalChunks: totalFileChunks
                    }];
                }
                else
                {
                    chunksQueue = [];
                    for(chunkId = 0; chunkId < totalFileChunks; ++chunkId)
                    {
                        chunkDataStart = chunkId * maxChunkSize;
                        chunksQueue.push({
                            chunkId: chunkId,
                            retries: 0,
                            totalChunks: totalFileChunks,
                            dataBegin: chunkDataStart,
                            dataEnd: chunkDataStart + maxChunkSize
                        });
                    }
                    uploader.chunksQueue[fileIndex] = chunksQueue.reverse();
                }
                uploader.fileQueue.push(fileIndex);

                liElem.appendChild(checkbox);
                liElem.appendChild(checkboxLabel);
                fileStatus.innerHTML = '<div id="_sg-uploader-fileProgressContainer'+ instanceId + fileIndex +'" class="_sg-uploader-fileProgress progress" style="width: 85px;display:none;vertical-align:middle;"><div id="_sg-uploader-fileProgress'+instanceId + fileIndex+'" class="progress-bar" role="progressbar" style="width:0;" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">0%</div></div>';
                fileStatus.setAttribute('class', '_sg-uploader-fileStatus');
                fileStatus.setAttribute('id', '_sg-uploader-fileStatusContainer'+instanceId + fileIndex);
                fileStatus.setAttribute('style', 'width: 100%;display:inline;margin-left:10px;');
                liElem.appendChild(fileStatus);
                fileList.appendChild(liElem);
            }

            if(initFileList)
            {
                fileList.setAttribute('class', '_sg-uploader-filesList');
                fileList.setAttribute('id', '_sg-uploader-filesList' + instanceId);
                var overallProgressBar = document.createElement('div');
                overallProgressBar.innerHTML = '<div id="_sg-uploader-fileProgressContainer'+ instanceId +'" class="_sg-uploader-fileProgress progress" style="width: 85px;display:none;vertical-align:middle;"><div id="_sg-uploader-fileProgress'+instanceId+'" class="progress-bar" role="progressbar" style="width:0;" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100">0%</div></div>';
                uploader.parentNode.appendChild(overallProgressBar);
                uploader.parentNode.appendChild(fileList);

                var uploadButton = document.createElement('button');
                uploadButton.setAttribute('class', '_sg-button _sg-button-primary');
                uploadButton.innerHTML = uploader.options.uploadButtonText;
                uploadButton.onclick = function(event)
                {
                    event.preventDefault();
                    var progressBar = document.getElementById('_sg-uploader-fileProgressContainer' + uploader.instanceId);

                    if(progressBar)
                    {
                        progressBar.style.display = 'inline-flex';
                    }

                    uploader.initTransfer();
                };

                uploader.parentNode.appendChild(uploadButton);
                uploader.fileList = fileList;
            }
        },

        initTransfer: function()
        {
            var uploader = this;
            if(uploader.fileQueue.length === 0)
            {
                if(uploader.activeTransfers === 0)
                {
                    var overallProgressBar = document.getElementById('_sg-uploader-fileProgressContainer' + this.instanceId);

                    if(overallProgressBar)
                    {
                        overallProgressBar.remove();
                    }

                    if(!uploader.errors)
                    {
                        // NOTE: ALl files transfered successfuly
                        if (uploader.waitingActiveTransfers.waitingFinalTransfers !== false)
                        {
                            clearTimeout(uploader.waitingActiveTransfers.waitingFinalTransfers);
                            uploader.waitingActiveTransfers.waitingFinalTransfers = false;
                        }

                        if (this.options.success !== null)
                        {
                            this.options.success.call(this);
                        }
                    }
                    else
                    {
                        if (this.options.error !== null)
                        {
                            this.options.error.call(this);
                        }
                    }
                }
                else if(uploader.waitingActiveTransfers.waitingFinalTransfers === false)
                {
                    uploader.waitingActiveTransfers.waitingFinalTransfers = setTimeout(function()
                    {
                        uploader.waitingActiveTransfers.waitingFinalTransfers = false;
                        uploader.initTransfer();
                    }, 100);
                }
            }
            else
            {
                var fileIndex = uploader.fileQueue.pop(),
                    progressBar = document.getElementById('_sg-uploader-fileProgressContainer' + uploader.instanceId + fileIndex);

                if(progressBar)
                {
                    progressBar.style.display = 'inline-flex';
                }

                uploader.transferFile(fileIndex);
            }
        },

        transferFile(fileIndex)
        {
            var uploader = this,
                file = this.files[fileIndex];

            if (uploader.chunksQueue[fileIndex].length === 0)
            {
                // NOTE: File fully transfered
                if(typeof uploader.waitingActiveTransfers[fileIndex] !== "undefined")
                {
                    clearTimeout(uploader.waitingActiveTransfers[fileIndex]);
                    delete uploader.waitingActiveTransfers[fileIndex];
                }

                if(!uploader.fileHasErrors(fileIndex))
                {
                    uploader.updateFileStatus(fileIndex, true);
                }

                setTimeout(function()
                {
                    uploader.initTransfer(); // NOTE: Continue to transfer the next file if any
                }, 0);
                return;
            }

            if((uploader.activeTransfers + 1) > uploader.options.maxConcurentTransfers)
            {
                if(typeof uploader.waitingActiveTransfers[fileIndex] === "undefined")
                {
                    uploader.waitingActiveTransfers[fileIndex] = setTimeout(function ()
                    {
                        delete uploader.waitingActiveTransfers[fileIndex];
                        uploader.transferFile(fileIndex);
                    }, 200);
                }
                return;
            }
            else if(typeof uploader.waitingActiveTransfers[fileIndex] !== "undefined")
            {
                clearTimeout(uploader.waitingActiveTransfers[fileIndex]);
                delete uploader.waitingActiveTransfers[fileIndex];
            }

            var dataChunk = uploader.chunksQueue[fileIndex].pop(),
                chunkId = dataChunk.chunkId,
                totalFileChunks = dataChunk.totalChunks,
                fileName = file.name,
                fileSize = file.size + '',
                maxRetries = uploader.options.maxRetries,
                xhr = new XMLHttpRequest(),
                serverResponse;

            xhr.open("post", uploader.options.transferDestination, true);

            xhr.setRequestHeader("Content-Type", "application/octet-stream");
            xhr.setRequestHeader("X-Chunk-Id", chunkId);
            xhr.setRequestHeader("X-Chunk-Checksum", singularityUploader.util.calcCrc32('' + chunkId + fileName + fileSize));
            xhr.setRequestHeader("X-Content-Length", fileSize);
            xhr.setRequestHeader("X-Content-Name", fileName);
            xhr.setRequestHeader("X-Session-Name", uploader.options.sessionName);
            xhr.setRequestHeader("X-Chunk-Count", totalFileChunks);
            xhr.onerror = function()
            {
                if(dataChunk.retries >= maxRetries)
                {
                    uploader.handleError('chunk id :' +  chunkId + ' transfer fail!'); // TODO: handle error
                }
                else
                {
                    ++dataChunk.retries;
                    uploader.chunksQueue[fileIndex].push(dataChunk);
                }
            };

            xhr.onreadystatechange = function()
            {
                if(xhr.readyState === 4)
                {
                    --uploader.activeTransfers;
                    if (xhr.status === 200)
                    {
                        serverResponse = JSON.parse(xhr.response);
                        if(serverResponse.success)
                        {
                            if(uploader.fileHasErrors(fileIndex))
                            {
                                return;
                            }
                            ++uploader.totalUploadedChunks;
                            uploader.updateFileProgress(fileIndex, Math.round(((totalFileChunks - uploader.chunksQueue[fileIndex].length) / totalFileChunks) * 100));
                        }
                        else if(serverResponse.recoverable)
                        {
                            if(uploader.fileHasErrors(fileIndex))
                            {
                                return;
                            }

                            if(dataChunk.retries >= maxRetries)
                            {
                                uploader.handleError('chunk id :' +  chunkId + ' transfer fail!'); // TODO: handle error
                            }
                            else
                            {
                                ++dataChunk.retries;
                                uploader.chunksQueue[fileIndex].push(dataChunk);
                            }
                        }
                        else if(uploader.chunksQueue[fileIndex].length)
                        {
                            // NOTE: Unrecoverable error
                            uploader.fileErrors[fileIndex] = serverResponse.msg;
                            uploader.chunksQueue[fileIndex] = [];
                            ++uploader.errors;
                            uploader.updateFileStatus(fileIndex, false, serverResponse.msg);
                        }
                    }
                    else
                    {
                        if(dataChunk.retries >= maxRetries)
                        {
                            uploader.handleError('chunk id :' +  chunkId + ' transfer fail!'); // TODO: handle error
                        }
                        else
                        {
                            ++dataChunk.retries;
                            uploader.chunksQueue[fileIndex].push(dataChunk);
                        }
                    }
                }
            };

            ++uploader.activeTransfers;
            xhr.send(totalFileChunks === 1 ? file : file.slice(dataChunk.dataBegin, dataChunk.dataEnd));
            setTimeout(function()
            {
                uploader.transferFile(fileIndex);
            }, 0);
        },

        updateFileProgress: function(fileIndex, currentProgress)
        {
            var progressBar = document.getElementById('_sg-uploader-fileProgress' + this.instanceId + fileIndex);

            if(progressBar)
            {
                currentProgress += '%';
                progressBar.style.width = currentProgress;
                progressBar.innerHTML = currentProgress;
            }
            this.updateOverallProgress();
        },

        updateOverallProgress: function()
        {
            var progressBar = document.getElementById('_sg-uploader-fileProgress' + this.instanceId),
                currentProgress = Math.round(this.totalUploadedChunks / this.totalFileChunks * 100) + '%';

            if(progressBar)
            {
                progressBar.style.width = currentProgress;
                progressBar.innerHTML = currentProgress;
            }
        },

        updateFileStatus: function(fileIndex, success, msg)
        {
            msg = msg || '';

            var checkbox = document.getElementById('_sg-uploader-fileStatusCheckbox' + this.instanceId + fileIndex),
                fileStatusContainer = document.getElementById('_sg-uploader-fileStatusContainer'+this.instanceId + fileIndex),
                statusIcon = success ? '<i class="fas fa-check" style="color:green;"></i> ' : '<i class="fas fa-times" style="color:red;"></i> ';

            if(checkbox)
            {
                checkbox.remove();
            }

            if(fileStatusContainer)
            {
                fileStatusContainer.innerHTML = statusIcon + msg;
            }
        },

        fileHasErrors: function(fileIndex)
        {
            return (typeof this.fileErrors[fileIndex] !== "undefined");
        },

        handleError: function(errorMsg)
        {
            console.log(errorMsg);
        },

        util:
            {
                hasClass: function(element, classStr)
                {
                    return (element.className.indexOf(classStr.trim()) !== -1);
                },

                /**
                 *  Extends the first argument with values from all the objects/array passed starting from the second argument.
                 *  If the first argument is a boolean true a deep extension will be made.
                 *  Warning! The first object/Array argument will be altered
                 *
                 * @returns {Object|Array}
                 */
                extend: function()
                {
                    var target, source,
                        length = arguments.length,
                        deep = arguments[0] === true,
                        i = 1;

                    if(deep)
                    {
                        i = 2;
                        target = arguments[1];
                    }
                    else
                    {
                        target = arguments[0];
                    }

                    for (; i < length; ++i)
                    {
                        source = arguments[i];
                        if(!source)
                        {
                            continue;
                        }

                        this.forEach(source,
                            function(obj, key)
                            {
                                if(deep && target[key] && (typeof obj === "object" || Array.isArray(obj)))
                                {
                                    target[key] = singularityUploader.util.extend(target[key], obj);
                                }
                                else
                                {
                                    target[key] = obj;
                                }
                            });
                    }
                    return target;
                },

                /**
                 *
                 * @param {Array|Object} enumerableItem
                 * @param fn(value, key)
                 */
                forEach: function(enumerableItem, fn)
                {
                    var key;
                    if(Array.isArray(enumerableItem))
                    {
                        var length = enumerableItem.length;
                        for(key = 0; key < length; ++key)
                        {
                            fn(enumerableItem[key], key);
                        }
                    }
                    else
                    {
                        for (key in enumerableItem)
                        {
                            if (enumerableItem.hasOwnProperty(key))
                            {
                                fn(enumerableItem[key], key);
                            }
                        }
                    }
                },

                calcCrc32: function(str)
                {
                    var crcTable =  window.crcTable || [];
                    if(!window.crcTable)
                    {
                        var c, n, k;
                        for (n = 0; n < 256; ++n)
                        {
                            c = n;
                            for (k = 0; k < 8; ++k)
                            {
                                c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
                            }
                            crcTable[n] = c;
                        }
                        window.crcTable = crcTable;
                    }

                    var i,
                        crc = 0 ^ (-1);

                    for (i = 0; i < str.length; ++i)
                    {
                        crc = (crc >>> 8) ^ crcTable[(crc ^ str.charCodeAt(i)) & 0xFF];
                    }

                    return (crc ^ (-1)) >>> 0;
                },
            }
    };