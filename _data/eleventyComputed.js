// Eleventy Computed Data
// This file must be valid JavaScript. It provides dynamic values derived from other global data.
// Removed embedded Nunjucks/JSON-LD markup (was invalid JS). Movie schema now lives in `movie.json.njk`.

export default {
	schemaorg: (data) => {
		const websiteNode = {
			"@type": "WebSite",
			"@id": `${data.metadata.url}#website`,
			name: data.metadata.title,
			description: data.metadata.description,
			url: data.metadata.url,
			publisher: {
				"@type": "Organization",
				name: data.metadata.author?.name || data.metadata.title,
				"@id": `${data.metadata.url}#publisher`
			}
		};

		// If a movie data object is present, attach an @id if missing and include it in graph
		const graph = [websiteNode];
		if (data.movie && typeof data.movie === 'object') {
			if (!data.movie['@id'] && data.page && data.page.url) {
				// Enhance movie object with an @id for linkage
				data.movie['@id'] = `${data.metadata.url.replace(/\/$/, '')}${data.page.url}#movie`;
			}
			graph.push(data.movie);
		}

		return {
			"@context": "https://schema.org",
			"@graph": graph
		};
	}
};