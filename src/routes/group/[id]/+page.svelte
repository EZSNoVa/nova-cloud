<script lang="ts">
	import Fa from 'svelte-fa';
	import type { PageServerData } from './$types';
	import { faHome, faSpinner } from '@fortawesome/free-solid-svg-icons';
	import Edit from '$lib/components/Edit.svelte';
	import { writable } from 'svelte/store';
	import { redirect } from '@sveltejs/kit';
	import { perform_action, upload_files } from '$lib';
	import toast from '$lib/stores/toast';
	import Toast from '$lib/components/Toast.svelte';
	import type { FileMetaType } from '$lib/types';
	import { onMount } from 'svelte';
	import { bytesToSize, mimeToExt } from '.';

	export let data: PageServerData;

	let group_name = writable(data.name); // Store to update UI on rename
	let files = writable(data.files);

	let input_files = writable<FileList | null>(null);
	let file_input_element: HTMLInputElement;

	let uploading = writable(false);

	async function handle_upload() {
		if (!$input_files) {
			return;
		}

		const formData = new FormData();
		formData.append('group', $group_name);
		formData.append('group_id', data.id);

		for (const file of $input_files) {
			formData.append('files', file);
		}

		uploading.set(true);
		let new_files = await upload_files(formData);
		uploading.set(false);

		// Clear input
		file_input_element.files = null;
		input_files.set(null);

		// Show error
		if ('error' in new_files && new_files.error) {
			toast.set({
				title: 'Error',
				message: 'Something went wrong while uploading the files.',
				type: 'error',
				duration: 3000
			});

			return;
		}

		files.update((list) => {
			list.push(...(new_files as FileMetaType[]));
			return list;
		});
	}

	function update_file_name(file_id: string, new_name: string) {
		files.update((list) => {
			const index = list.findIndex((file) => file.id === file_id);
			list[index].name = new_name;
			return list;
		});
	}

	async function handle_action(
		action: 'group rename' | 'group delete' | 'file rename' | 'file delete',
		group_id: string,
		file_id?: string
	) {
		// returns: either new_name (if renaming) or boolean (false if error)
		const result = await perform_action(action, group_id, file_id);

		// Reflect changes
		if (!result) {
			return;
		} // Error already told

		// If deleting group -> redirect to home
		if (action === 'group delete') {
			throw redirect(302, '/');
		}
		// If deleting file -> remove from UI
		else if (action === 'file delete') {
			files.update((list) => list.filter((file) => file.id !== file_id));
		}

		// If renaming
		else if (action.includes('rename')) {
			action.includes('group')
				? group_name.set(result as string) // Rename group
				: update_file_name(file_id as string, result as string); // Rename file
		}
	}

	// On mount calculate total size of group
	let total_size = $files.reduce((acc, file) => acc + file.size, 0);

	files.subscribe((list) => {
		total_size = list.reduce((acc, file) => acc + file.size, 0);
	});

</script>

<main class="flex flex-col justify-center items-center p-2 w-auto">
	<nav class="flex justify-between items-center w-full px-4 mb-3">
		<a href="/">
			<Fa icon={faHome} class="text-2xl" />
		</a>

		<h1 class="text-2xl text-center">{$group_name}</h1>

		<Edit
			handlers={{
				rename: async () => await handle_action('group rename', data.id),
				delete: async () => await handle_action('group delete', data.id)
			}}
		/>
	</nav>

	<Toast />

	<!-- upload files-->
	<form
		class="flex flex-col justify-center items-center w-full h-auto bg-gray/80 rounded-md shadow-lg p-2 m-1 mb-3 border"
		on:submit|preventDefault={handle_upload}
	>
		<div class="flex justify-center items-center w-full">
			<input
				class="text-base w-1/2"
				style="margin: 0 !important; padding: 0.25rem;"
				type="file"
				multiple
				bind:files={$input_files}
				accept="*"
				name="file"
				bind:this={file_input_element}
				required
			/>

			{#if $uploading}
				<div class="w-1/2">
					<Fa icon={faSpinner} class="animate-spin text-lg" />
				</div>
			{:else}
				<button class="p-1 text-base w-1/2" type="submit"> Upload </button>
			{/if}
		</div>
	</form>

	<h3 class="text-xl text-center">{$files.length} files - {bytesToSize(total_size)}</h3>

	<!-- files -->
	<ol
		class="flex flex-col justify-center items-center w-full h-auto bg-gray/80 rounded-md shadow-lg p-4 m-4 border"
	>
		{#if $files.length === 0}
			<p class="text-white text-md">No files uploaded yet...</p>
		{/if}

		{#each $files as file}
			<li class="flex w-full justify-between items-center m-1 p-1">
				<p class="text-white text-md hover:text-gray-100 truncate mr-2"
					title={(file.size / 1024) / 1024 > 1 ? `${((file.size / 1024) / 1024).toFixed(2)} MB` : `${(file.size / 1024).toFixed(2)} KB`}
				>{bytesToSize(file.size)}</p>

				<a href="/file/{file.id}" class="hover:underline truncate" target="_blank">
					<p
						class="
						text-white text-md hover:text-gray-100
						"
					>
						{file.name}
					</p></a
				>
				<p
					class="ml-2
						text-white text-md hover:text-gray-100 truncate
						"
				>
					{mimeToExt(file.type)}
				</p>

				<Edit
					handlers={{
						rename: async () => await handle_action('file rename', data.id, file.id),
						delete: async () => await handle_action('file delete', data.id, file.id)
					}}
				/>
			</li>
		{/each}
	</ol>
</main>
