import { uploadFileAttachment } from "../../../../../scripts/chats.js";
import { getRequestHeaders } from '../../../../../script.js';

let loaded = {};
let waiting = {};
export const fileManager = {
    readFile: (name, force = false) => {
        let result = null;
        if (loaded[name] && !force) {
            return loaded[name];
        }
        fetch(`/user/files/${name}.json`)
            .then(response => response.json())
            .then(configData => {
                result = configData;
            })
            .catch(error => {
                console.error('Error loading plugin config:', error);
                return null;
            });
        return result;
    },
    writeFile: (name, data, force = false) => {
        loaded[name] = data;
        if (force) {
            uploadFileAttachment(name, btoa(JSON.stringify(data))) // 立即上传
                .catch(error => {
                    console.error(`Error uploading file ${name} immediately:`, error);
                    // 重试
                });
        } else {
            waiting[name] = data; // 加入等待队列
        }
    },
    // readFilesInDir: () => {
    //
    // }

}

// 调整 setInterval 频率，并批量上传
setInterval(() => {
    const filesToUpload = Object.keys(waiting);
    if (filesToUpload.length > 0) {
        const uploadPromises = filesToUpload.map(name => {
            const data = waiting[name];
            return uploadFileAttachment(name, btoa(JSON.stringify(data)))
                .then(() => {
                    delete waiting[name];
                })
                .catch(error => {
                    console.error(`Error uploading file ${name} in batch:`, error);
                    // 将文件放回等待队列稍后重试
                });
        });

        Promise.all(uploadPromises).then(() => {
            console.log("Batch file upload completed (or errors encountered)");
        });
    }
}, 200);
