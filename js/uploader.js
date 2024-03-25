class Uploader
{
	url = "https://kappa.lol/api/upload"
	field = "file"
	headers
	linkFormat = "{link}"
	deleteFormat = "{delete}"

	upload(blob, name, progress, result) {
		const form = new FormData();
		form.append(this.field, blob, name);

		const xhr = new XMLHttpRequest();
		xhr.open('POST', this.url);
		xhr.upload.addEventListener
		
		if(progress)
			xhr.upload.onprogress = (e) => progress(e);
		
		xhr.onreadystatechange = (e) =>
		{
			if(xhr.readyState == XMLHttpRequest.DONE)
			{
				if(xhr.status <= 200 && xhr.status < 300)
				{
					var j = JSON.parse(xhr.responseText);
					console.log(j);
					result({
						link: formatGetIndexed(this.linkFormat, j),
						delete: formatGetIndexed(this.deleteFormat, j)
					});
				}
				else
				{
					result({ error: [xhr, e] });
				}
			}
		};
		xhr.send(form);
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