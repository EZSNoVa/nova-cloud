import { db } from './db';
import type { FileMetaType, GroupType } from '$lib/types';
import { v4 as uuid } from 'uuid';
import { delete_file, delete_files, rename_file } from './files';
let collection = db.collection<GroupType>('groups');

/**
 * Create a group and upload files to it, if group already exists, upload files to it too.
 * @param name - Name of the group
 * @param files - Files to upload to the group (meta), file should be already uploaded to db beforehand using  `upload_file`
 * @returns GroupType - The group created or existing group
 */
export async function create_group(name: string, files: FileMetaType[] = []): Promise<GroupType> {
	// Check if group already exists
	let _group: GroupType | null = await collection.findOne({ name }, { projection: { _id: 0 } });
	if (_group) {
		// Upload files to group
		await group_add_files(_group.id, files);
		return _group;
	}

	const group = {
		id: uuid(),
		name,
		files: files,
		groups: []
	};

	await collection.insertOne(group);
	return group;
}

export async function get_group(identifier: string): Promise<GroupType | null> {
	const group = await collection.findOne(
		{ $or: [{ id: identifier }, { name: identifier }] },
		{ projection: { _id: 0 } }
	);

	if (!group) {
		return null;
	}
	return group;
}

export async function get_groups() {
	const groups = (await collection.find({}, { projection: { _id: 0 } }).toArray()) as GroupType[];
	return groups;
}

export async function get_files_from_group(group_name: string): Promise<FileMetaType[]> {
	const group = await get_group(group_name);
	if (!group) {
		return [];
	}
	return group.files;
}

/**
 * delete a group and all its files
 */
export async function delete_group(id: string) {
	let group = await get_group(id);

	if (!group) {
		return;
	}

	// Delete all files
	await delete_files(group.files.map((file) => file.id));

	await collection.deleteOne({ id });
}

/**
 * Rename a group
 */
export async function rename_group(id: string, name: string) {
	await collection.updateOne({ id }, { $set: { name } });
}

/**
 * remove a file from a group
 * @param group_id
 * @param file_id
 * @returns true if file was removed, false if file was not found
 */
export async function group_remove_file(group_id: string, file_id: string) {
	const group = await get_group(group_id);
	if (!group) {
		return false;
	}

	// Delete file
	await delete_file(file_id);

	// Remove file from group
	await collection.updateOne({ id: group_id }, { $pull: { files: { id: file_id } } });

	return true;
}

/**
 * Add a file to a group
 * @param group_id
 * @param file
 * @returns true if file was added, false if file already exists
 */
export async function group_add_file(group_id: string, file: FileMetaType) {
	const group = await get_group(group_id);
	if (!group) {
		return false;
	}

	// Check if file already exists
	if (group.files.find((f) => f.id === file.id)) {
		return false;
	}

	// Add file to group
	await collection.updateOne({ id: group_id }, { $push: { files: file } });

	return true;
}

/**
 * Add multiple files to a group
 * @param group_id
 * @param files
 */
export async function group_add_files(group_id: string, files: FileMetaType[]) {
	const group = await get_group(group_id);
	if (!group) {
		return;
	}

	// Add files to group
	await collection.updateOne({ id: group_id }, { $push: { files: { $each: files } } });
}

/**
 * Rename a file
 * @param group_id
 * @param file_id
 * @param name
 */
export async function group_rename_file(group_id: string, file_id: string, name: string) {
	const new_name = await rename_file(file_id, name);

	// Update group
	await collection.updateOne(
		{ id: group_id, 'files.id': file_id },
		{ $set: { 'files.$.name': new_name } }
	);
}
