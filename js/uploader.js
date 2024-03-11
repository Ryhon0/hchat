class Uploader
{
	url = "https://femboy.beauty/api/upload"
	field = "file"
	headers
	linkFormat = "{link}"
	deleteFormat = "{delete}"

	async upload(blob, name) {
		var form = new FormData();
		form.append(this.field, blob, name);

		var r = await fetch(this.url, 
			{
				method: 'POST',
				body: form,
				headers: {

				}
			});
		var j = await r.json();

		return {
			link: formatGetIndexed(this.linkFormat, j),
			delete: formatGetIndexed(this.deleteFormat, j)
		}
	}
}

function formatGetIndexed(fmt, obj) {
	return fmt.replace(/{(.+)}/g, function (match, path) {
		return getIndexed(obj, path);
	});
}

function getIndexed(obj, path)
{
	var split = path.split('.');

	for(var p of split)
		obj = obj[p];

	return obj;
}