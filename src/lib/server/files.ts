import { db } from './db'; // Import your database utility function
import { GridFSBucket } from 'mongodb';
import { v4 as uuid } from 'uuid';
import type { FileMetaType } from '$lib/types';

const bucket = new GridFSBucket(db, {
    bucketName: 'files',
});

export type FileType = {
    id: string;
    type: string;
    name: string;
    size: number;
    data: Buffer; // Optional for Binary upload
};


async function upload_gridfs(file: File): Promise<string> {
    const id = uuid();

    const uploadStream = bucket.openUploadStream(id, {
        metadata: {
            name: file.name,
            size: file.size,
            type: file.type,
        }
    });

    uploadStream.on('error', (error) => {
        console.log(error);
    });

    uploadStream.on('finish', () => {
        console.log('File uploaded:', file.name, file.type, file.size);
    });

    const buffer = Buffer.from(await file.arrayBuffer());

    // Split buffer into 16MB chunks
    const chunkSizeBytes = 1024 * 1024 * 16;
    for (let i = 0; i < buffer.length; i += chunkSizeBytes) {
        uploadStream.write(buffer.slice(i, i + chunkSizeBytes));
    }

    uploadStream.end();

    return id;
}

export async function upload_file(file: File): Promise<string> {
    return await upload_gridfs(file);
}

export async function get_file(id: string): Promise<FileType | null> {
    // Get file from bucket
    const cursor = bucket.find(
        { filename: id },
        { limit: 1 });

    const file = await cursor.next();
    if (!file) { return null; }

    // Get file data
    const readStream = bucket.openDownloadStream(file._id)
    readStream.on('error', (error) => {
        console.log(error);
    });

    const data = await new Promise((resolve, reject) => {
        const chunks: any[] = [];
        readStream.on('data', (chunk) => chunks.push(chunk));
        readStream.on('error', (error) => reject(error));
        readStream.on('end', () => resolve(Buffer.concat(chunks)));
    });

    const meta = file.metadata as {
        name: string;
        size: number;
        type: string;
    }

    return {
        id,
        type: meta.type,
        name: meta.name,
        size: meta.size,
        data: data as Buffer,
    };
}

/**
 * Check if file exists
 */
export async function exists(id: string): Promise<boolean> {
    const cursor = bucket.find(
        { filename: id },
        { limit: 1 });

    const file = await cursor.next();
    return !!file;
}

/**
 * Get's all files metadata
 */
export async function get_file_list(): Promise<FileMetaType[]> {
    const cursor = bucket.find({}, { limit: 100 });

    const files = await cursor.toArray();

    return files.map(file => {
        const meta = file.metadata as {
            name: string;
            size: number;
            type: string;
        }

        return {
            id: file.filename,
            type: meta.type,
            name: meta.name,
            size: meta.size,
        }
    });
}


/**
 * Delete a file
 */
export async function delete_file(id: string) {
    // Get mongodb file id
    const cursor = bucket.find(
        { filename: id },
        { limit: 1 });
        
    const file = await cursor.next();

    console.log("Deleting file", id, file); 

    if (!file) { return; }

    // Delete file
    await bucket.delete(file._id);
}

/**
 * Delete many files
 */
export async function delete_files(ids: string[]) {
    // Get mongodb file id
    const cursor = bucket.find(
        { filename: { $in: ids } },
        { limit: 100 });

    const files = await cursor.toArray();

    // Delete files
    for (const file of files) {
        await bucket.delete(file._id);
    }
}


export async function rename_file(id: string, name: string) {
    // Get mongodb file id
    const cursor = bucket.find(
        { filename: id },
        { limit: 1 });

    const file = await cursor.next();

    if (!file) { return; }
    

    const file_ext = file.filename.split('.').pop();
    let new_name = name + '.' + file_ext;

    // Rename file
    await bucket.rename(file._id, new_name);

    return new_name;
}