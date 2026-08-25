const DATA_PATH = "data/SSDSE-F-2023v3.csv";
const MAP_PATH = "https://raw.githubusercontent.com/dataofjapan/land/master/japan.geojson";
const KANTO_PREFECTURES = ["茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県"];
const PREFECTURE_COLORS = ["#4e79a7", "#f28e2c", "#e15759", "#76b7b2", "#59a14f", "#edc949", "#b07aa1"];
const MONTHS = Array.from({ length: 12 }, (_, index) => `${String(index + 1).padStart(2, "0")}月`);
const METRICS = [
	{ key: "降水量の合計", label: "降水量の合計", unit: "mm", format: value => `${value.toFixed(1)} mm` },
	{ key: "日降水量10mm以上の日数", label: "日降水量10mm以上の日数", unit: "時間相当", format: value => `約${Math.round(value * 24)}時間相当（${value.toFixed(1)}日）` },
	{ key: "日降水量30mm以上の日数", label: "日降水量30mm以上の日数", unit: "時間相当", format: value => `約${Math.round(value * 24)}時間相当（${value.toFixed(1)}日）` },
	{ key: "日降水量50mm以上の日数", label: "日降水量50mm以上の日数", unit: "時間相当", format: value => `約${Math.round(value * 24)}時間相当（${value.toFixed(1)}日）` },
	{ key: "日降水量100mm以上の日数", label: "日降水量100mm以上の日数", unit: "時間相当", format: value => `約${Math.round(value * 24)}時間相当（${value.toFixed(1)}日）` }
];

const chartState = { metric: "日降水量50mm以上の日数", prefecture: "すべて", month: "09月", view: "map" };

function createSelect(containerId, options, value, onChange) {
	const select = d3.select(`#${containerId}`).append("select")
		.attr("class", "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100 sm:min-w-52")
		.on("change", event => onChange(event.target.value));
	select.selectAll("option").data(options).join("option")
		.attr("value", option => option.value).text(option => option.label)
		.property("selected", option => option.value === value);
}

function parseCsv(text) {
	const rows = d3.csvParseRows(text);
	const columns = rows[1];
	return rows.slice(2).map(row => Object.fromEntries(columns.map((column, index) => [column, row[index]])))
		.filter(row => KANTO_PREFECTURES.includes(row["都道府県"]) && MONTHS.includes(row["月・年"]))
		.map(row => ({ ...row, latitude: Number(row["緯度"]), longitude: Number(row["経度"]) }));
}

function render(data, mapData) {
	const metric = METRICS.find(item => item.key === chartState.metric);
	d3.select("#selectionSummary").text(`${chartState.prefecture === "すべて" ? "関東全域" : chartState.prefecture} / ${chartState.month} / ${metric.label}`);
	const monthRows = data.filter(row => row["月・年"] === chartState.month)
		.map(row => ({ ...row, value: Number(row[chartState.metric]) }));
	const selectedMonthData = monthRows.filter(row => chartState.prefecture === "すべて" || row["都道府県"] === chartState.prefecture);
	const filtered = chartState.view === "map" ? monthRows : selectedMonthData;
	if (chartState.view === "bars") {
		renderBarChart(data, selectedMonthData, metric);
		return;
	}
	const width = Math.max(640, document.querySelector("#viewportContainer").clientWidth);
	const height = Math.max(490, width * 0.62);
	const features = mapData.features.filter(feature => KANTO_PREFECTURES.includes(feature.properties.nam_ja)).map(feature => {
		if (feature.properties.nam_ja !== "東京都" || feature.geometry.type !== "MultiPolygon") return feature;
		const mainland = d3.greatest(feature.geometry.coordinates, polygon => d3.geoArea({ type: "Feature", geometry: { type: "Polygon", coordinates: polygon } }));
		return { ...feature, geometry: { type: "Polygon", coordinates: mainland } };
	});
	const featureCollection = { type: "FeatureCollection", features };
	if (!filtered.length || !featureCollection.features.length) {
		d3.select("#viewportContainer").html('<p class="p-8 text-sm text-slate-600">選択した条件のデータを表示できません。</p>');
		return;
	}
	const projection = d3.geoMercator().center([139.3, 36.0]).scale(width * 18).translate([width / 2, height / 2 + 42]);
	const path = d3.geoPath(projection);
	const maxValue = d3.max(filtered, row => row.value) || 1;
	const minValue = d3.min(filtered, row => row.value) || 0;
	const heightScale = d3.scaleLinear().domain([0, maxValue]).range([8, 105]);
	const color = d3.scaleSequential(d3.interpolateYlOrRd).domain([minValue === maxValue ? 0 : minValue, maxValue]);
	const formatValue = value => metric.format(value);

	d3.select("#viewportContainer").selectAll("svg").remove();
	const svg = d3.select("#viewportContainer").append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("width", "100%").attr("role", "img").attr("aria-label", `関東の地図上に${chartState.month}の${metric.label}を立体棒で表示`);
	svg.append("rect").attr("width", width).attr("height", height).attr("fill", "#f0f9ff");
	svg.append("g").selectAll("path").data(featureCollection.features).join("path").attr("d", path).attr("fill", "#dcecf0").attr("stroke", "#ffffff").attr("stroke-width", 1.5);
	const bars = svg.append("g").selectAll("g").data(filtered).join("g").attr("transform", row => `translate(${projection([row.longitude, row.latitude])})`);
	const barWidth = Math.max(18, Math.min(30, width / 28));
	const depth = barWidth * 0.32;
	bars.append("ellipse").attr("cx", 0).attr("cy", 4).attr("rx", barWidth * 0.58).attr("ry", 5).attr("fill", "#94a3b8").attr("opacity", 0.45);
	const isSelected = row => chartState.prefecture === "すべて" || row["都道府県"] === chartState.prefecture;
	const fadeColor = value => d3.color(color(value)).copy({ opacity: 0.22 });
	bars.append("path").attr("d", row => { const barHeight = heightScale(row.value); return `M${-barWidth / 2},0 L${barWidth / 2},0 L${barWidth / 2},${-barHeight} L${-barWidth / 2},${-barHeight}Z`; }).attr("fill", row => isSelected(row) ? color(row.value) : fadeColor(row.value)).attr("stroke", row => isSelected(row) ? "#9a3412" : "#94a3b8").attr("stroke-width", row => isSelected(row) ? 0.8 : 0.4);
	bars.append("path").attr("d", row => { const barHeight = heightScale(row.value); return `M${barWidth / 2},${-barHeight} L${barWidth / 2 + depth},${-barHeight - depth / 2} L${barWidth / 2 + depth},${-depth / 2} L${barWidth / 2},0Z`; }).attr("fill", row => { const base = isSelected(row) ? color(row.value) : fadeColor(row.value); return d3.color(base).darker(0.7); });
	bars.append("path").attr("d", row => { const barHeight = heightScale(row.value); return `M${-barWidth / 2},${-barHeight} L${barWidth / 2},${-barHeight} L${barWidth / 2 + depth},${-barHeight - depth / 2} L${-barWidth / 2 + depth},${-barHeight - depth / 2}Z`; }).attr("fill", row => { const base = isSelected(row) ? color(row.value) : fadeColor(row.value); return d3.color(base).brighter(0.6); });
	bars.append("text").attr("y", row => -heightScale(row.value) - depth - 5).attr("text-anchor", "middle").attr("class", row => isSelected(row) ? "fill-slate-800 text-[11px] font-semibold" : "fill-slate-400 text-[10px]").text(row => row["市"].replace("市", ""));
	bars.append("text").attr("y", row => -heightScale(row.value) - depth - 19).attr("text-anchor", "middle").attr("class", row => isSelected(row) ? "fill-slate-700 text-[9px] font-semibold" : "fill-slate-400 text-[9px]").text(row => formatValue(row.value));
	bars.append("title").text(row => `${row["都道府県"]} ${row["市"]} / ${chartState.month}: ${formatValue(row.value)}`);
	const hottest = d3.greatest(filtered, row => row.value);
	const selectedMonthMax = d3.max(filtered, row => row.value) || 0;
	const mapScope = chartState.prefecture === "すべて" ? "関東7地点" : `関東7地点（${chartState.prefecture}を強調）`;
	d3.select("#chartDescription").text(`${chartState.month}の${metric.label}（${metric.unit}）｜${mapScope}｜棒が高いほど値が大きい｜最大: ${hottest["都道府県"]} ${hottest["市"]} ${formatValue(hottest.value)}`);
	d3.select("#summary").html(`<span class="text-2xl font-semibold text-slate-900">${filtered.length}</span><span class="ml-2 text-sm text-slate-500">地点を表示中</span>`);
	d3.select("#legend").html(`<div class="flex max-w-xl flex-wrap items-center gap-3 text-xs text-slate-500"><span>少ない</span><div class="h-3 min-w-32 flex-1 rounded-full" style="background: linear-gradient(90deg, ${color(minValue)}, ${color(maxValue)})"></div><span>多い</span><span class="ml-2 font-semibold text-slate-700">${chartState.month}: ${formatValue(minValue)}〜${formatValue(selectedMonthMax)}</span><span class="w-full text-slate-400">色は選択月の地点間の差を強調</span></div>`);
	d3.select("#insight").text(`${chartState.month}の関東では${hottest["都道府県"]}${hottest["市"]}が最大で、${formatValue(hottest.value)}です。選択月の地点別の範囲は${formatValue(minValue)}〜${formatValue(selectedMonthMax)}です。`);
	renderRelationship(data, metric);
}

d3.selectAll("[data-chart-tab]").on("click", function () {
	const selectedTab = this.dataset.chartTab;
	d3.selectAll("[data-chart-tab]").classed("is-active", (_, index, nodes) => nodes[index].dataset.chartTab === selectedTab);
	d3.select("#mapSection").classed("hidden", selectedTab !== "map");
	d3.select("#relationshipSection").classed("hidden", selectedTab !== "relationship");
});

function renderBarChart(data, selectedMonthData, metric) {
	const chartData = chartState.prefecture === "すべて"
		? selectedMonthData
		: data.filter(row => row["都道府県"] === chartState.prefecture).map(row => ({ ...row, value: Number(row[chartState.metric]) }));
	if (!chartData.length) {
		d3.select("#viewportContainer").html('<p class="p-8 text-sm text-slate-600">選択した条件のデータを表示できません。</p>');
		return;
	}
	const width = Math.max(640, document.querySelector("#viewportContainer").clientWidth);
	const margin = { top: 24, right: 96, bottom: 48, left: 144 };
	const height = Math.max(300, margin.top + chartData.length * 42 + margin.bottom);
	const maxValue = d3.max(chartData, row => row.value) || 1;
	const minValue = d3.min(chartData, row => row.value) || 0;
	const x = d3.scaleLinear().domain([0, maxValue]).nice().range([margin.left, width - margin.right]);
	const y = d3.scaleBand().domain(chartData.map(row => chartState.prefecture === "すべて" ? `${row["都道府県"]} ${row["市"]}` : row["月・年"])).range([margin.top, height - margin.bottom]).padding(0.25);
	const color = d3.scaleSequential(d3.interpolateOrRd).domain([minValue === maxValue ? 0 : minValue, maxValue]);
	const formatValue = value => metric.format(value);
	const isSelected = row => chartState.prefecture === "すべて" || row["月・年"] === chartState.month;
	const barColor = row => isSelected(row) ? color(row.value) : d3.color(color(row.value)).copy({ opacity: 0.22 });

	d3.select("#viewportContainer").selectAll("svg").remove();
	const svg = d3.select("#viewportContainer").append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("width", "100%").attr("role", "img").attr("aria-label", `${chartState.prefecture === "すべて" ? chartState.month : chartState.prefecture + "の12か月"}の${metric.label}横棒グラフ`);
	svg.append("g").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).ticks(6)).call(axis => axis.append("text").attr("x", width - margin.right).attr("y", 38).attr("fill", "#475569").attr("text-anchor", "end").text(`${metric.label}（${metric.unit}）`));
	svg.append("g").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).tickSize(0));
	const bars = svg.append("g").selectAll("rect").data(chartData).join("rect")
		.attr("x", margin.left).attr("y", row => y(chartState.prefecture === "すべて" ? `${row["都道府県"]} ${row["市"]}` : row["月・年"])).attr("width", row => x(row.value) - margin.left).attr("height", y.bandwidth()).attr("rx", 4).attr("fill", barColor).attr("fill-opacity", row => isSelected(row) ? 1 : 0.75).attr("stroke", row => isSelected(row) ? "#9a3412" : "#cbd5e1").attr("stroke-width", 1);
	bars.append("title").text(row => `${row["都道府県"]} ${row["市"]} / ${row["月・年"]}: ${formatValue(row.value)}`);
	svg.append("g").selectAll("text").data(chartData).join("text").attr("x", row => x(row.value) + 8).attr("y", row => y(chartState.prefecture === "すべて" ? `${row["都道府県"]} ${row["市"]}` : row["月・年"]) + y.bandwidth() / 2 + 4).attr("class", row => isSelected(row) ? "fill-slate-700 text-xs font-semibold" : "fill-slate-400 text-xs").text(row => formatValue(row.value));
	const hottest = d3.greatest(selectedMonthData, row => row.value);
	const chartLabel = chartState.prefecture === "すべて" ? `${chartState.month}の地域別` : `${chartState.prefecture}の12か月`;
	d3.select("#chartDescription").text(`${chartLabel}${metric.label}（${metric.unit}）｜棒の長さで値を比較｜${chartState.prefecture === "すべて" ? `最大: ${hottest["都道府県"]} ${hottest["市"]} ${formatValue(hottest.value)}` : `${chartState.month}を濃く表示`}`);
	d3.select("#summary").html(`<span class="text-2xl font-semibold text-slate-900">${chartData.length}</span><span class="ml-2 text-sm text-slate-500">${chartState.prefecture === "すべて" ? "地点を表示中" : "月を表示中"}</span>`);
	d3.select("#legend").html(`<div class="text-xs text-slate-500">${chartState.prefecture === "すべて" ? `${chartState.month}:` : `${chartState.prefecture} 12か月:`} 0〜${formatValue(maxValue)}（棒の長さで比較）</div>`);
	d3.select("#insight").text(chartState.prefecture === "すべて" ? `${chartState.month}の関東では${hottest["都道府県"]}${hottest["市"]}が最大で、${formatValue(hottest.value)}です。横棒の長さから、選択月の地点間の差を比較できます。` : `${chartState.prefecture}の12か月を横棒で比較しています。${chartState.month}を濃く表示し、他の月は薄くして季節変化を読みやすくしています。`);
	renderRelationship(data, metric);
}

function renderRelationship(data, metric) {
	const width = Math.max(640, document.querySelector("#relationshipChart").clientWidth);
	const height = 400;
	const margin = { top: 24, right: 28, bottom: 58, left: 72 };
	const points = data.filter(row => chartState.prefecture === "すべて" ? row["月・年"] === chartState.month : row["都道府県"] === chartState.prefecture)
		.map(row => ({ ...row, temperature: Number(row["平均気温"]), humidity: Number(row["平均相対湿度"]), value: Number(row[chartState.metric]) }));
	const x = d3.scaleLinear().domain(d3.extent(points, point => point.temperature)).nice().range([margin.left, width - margin.right]);
	const y = d3.scaleLinear().domain([0, d3.max(points, point => point.value) || 1]).nice().range([height - margin.bottom, margin.top]);
	const radius = d3.scaleSqrt().domain(d3.extent(data, row => Number(row["平均相対湿度"]))).range([4, 12]);
	const prefectures = [...new Set(points.map(point => point["都道府県"]))];
	const color = d3.scaleOrdinal().domain(KANTO_PREFECTURES).range(PREFECTURE_COLORS);

	d3.select("#relationshipChart").selectAll("svg").remove();
	const svg = d3.select("#relationshipChart").append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("width", "100%").attr("role", "img").attr("aria-label", `平均気温と${metric.label}の散布図`);
	svg.append("g").attr("transform", `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).ticks(7)).call(axis => axis.append("text").attr("x", width - margin.right).attr("y", 42).attr("fill", "#475569").attr("text-anchor", "end").text("平均気温（℃）"));
	svg.append("g").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(6)).call(axis => axis.append("text").attr("x", -margin.left + 8).attr("y", margin.top - 10).attr("fill", "#475569").attr("text-anchor", "start").text(`${metric.label}（${metric.unit}）`));
	svg.append("g").attr("class", "grid").selectAll("line").data(y.ticks(6)).join("line").attr("x1", margin.left).attr("x2", width - margin.right).attr("y1", tick => y(tick)).attr("y2", tick => y(tick)).attr("stroke", "#e2e8f0");
	const dots = svg.append("g").selectAll("circle").data(points).join("circle")
		.attr("cx", point => x(point.temperature)).attr("cy", point => y(point.value)).attr("r", point => radius(point.humidity) + (point["月・年"] === chartState.month ? 2 : 0))
		.attr("fill", point => color(point["都道府県"])).attr("fill-opacity", point => point["月・年"] === chartState.month ? 1 : 0.65)
		.attr("stroke", point => point["月・年"] === chartState.month ? "#0f172a" : "none").attr("stroke-width", 1.5);
	dots.append("title").text(point => `${point["都道府県"]} ${point["市"]} / ${point["月・年"]}: 気温 ${point.temperature.toFixed(1)}℃、湿度 ${point.humidity.toFixed(0)}%、${metric.label} ${metric.format(point.value)}`);
	if (chartState.prefecture !== "すべて") {
		svg.append("g").selectAll("text").data(points).join("text")
			.attr("x", point => x(point.temperature) + 8).attr("y", point => y(point.value) - 8)
			.attr("class", point => point["月・年"] === chartState.month ? "fill-slate-900 text-[11px] font-bold" : "fill-slate-500 text-[10px]")
			.text(point => point["月・年"]);
	}
	const relationshipDescription = chartState.prefecture === "すべて"
		? `${chartState.month}の関東7地点を比較しています。`
		: `${chartState.prefecture}の12か月を比較しています。点の横に月を表示し、${chartState.month}を大きな点で強調しています。`;
	d3.select("#relationshipDescription").text(`横軸は平均気温、縦軸は${metric.label}、点の大きさは平均相対湿度。${relationshipDescription}`);
	d3.select("#relationshipLegend").selectAll(".legend-item").data(prefectures).join("span").attr("class", "legend-item").html(prefecture => `<span class="mr-1 inline-block h-2.5 w-2.5 rounded-full" style="background:${color(prefecture)}"></span>${prefecture}`);
	d3.select("#relationshipLegend").selectAll(".humidity-legend").data([1]).join("span").attr("class", "humidity-legend ml-2 font-semibold text-slate-700").text("点の大きさ: 平均相対湿度（%）");
	d3.select("#relationshipTableBody").selectAll("tr").data(points).join("tr").html(point => `<td class="whitespace-nowrap px-4 py-2">${point["都道府県"]} ${point["市"]}</td><td class="whitespace-nowrap px-4 py-2">${point["月・年"]}</td><td class="whitespace-nowrap px-4 py-2">${point.temperature.toFixed(1)}℃</td><td class="whitespace-nowrap px-4 py-2 font-semibold text-slate-800">${point.humidity.toFixed(0)}%</td><td class="whitespace-nowrap px-4 py-2">${metric.format(point.value)}</td>`);
}

Promise.all([d3.text(DATA_PATH), d3.json(MAP_PATH)]).then(([csvText, mapData]) => {
	const data = parseCsv(csvText);
	createSelect("variableSelector", METRICS.map(metric => ({ value: metric.key, label: metric.label })), chartState.metric, value => { chartState.metric = value; render(data, mapData); });
	createSelect("regionSelector", [{ value: "すべて", label: "関東全域" }, ...KANTO_PREFECTURES.map(prefecture => ({ value: prefecture, label: prefecture }))], chartState.prefecture, value => { chartState.prefecture = value; render(data, mapData); });
	createSelect("monthSelector", MONTHS.map(month => ({ value: month, label: month })), chartState.month, value => { chartState.month = value; render(data, mapData); });
	createSelect("viewSelector", [{ value: "map", label: "地図" }, { value: "bars", label: "横棒グラフ" }], chartState.view, value => { chartState.view = value; render(data, mapData); });
	render(data, mapData);
}).catch(error => {
	d3.select("#viewportContainer").html(`<p class="p-8 text-sm text-red-700">データまたは地図を読み込めませんでした: ${error.message}</p>`);
});
