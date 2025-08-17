angular.module('appControllers').controller('MapCtrl', MapCtrl);           // get the main module contollers set
MapCtrl.$inject = ['$rootScope', '$scope', '$state', '$http', '$interval', 'craftService'];  // Inject my dependencies

// @ts-check
/** @type {import("ol/Map").default} */
/* global MetarIcon */ // let TS/JS know the global exists

function MapCtrl($rootScope, $scope, $state, $http, $interval, craftService) {
	let TRAFFIC_MAX_AGE_SECONDS = 15;

	$scope.$parent.helppage = 'plates/radar-help.html';

	$scope.aircraftSymbols = new ol.source.Vector();
	$scope.metarSymbols = new ol.source.Vector();
	$scope.aircraftTrails = new ol.source.Vector();

	let osm = new ol.layer.Tile({
		title: '<i class="fa fa-cloud"></i> OSM',
		type: 'base',
		source: new ol.source.OSM()
	});

	let openaip = new ol.layer.Tile({
		title: '<i class="fa fa-cloud"></i> OpenAIP',
		type: 'overlay',
		visible: false,
		source: new ol.source.XYZ({
			url: 'https://api.tiles.openaip.net/api/data/openaip/{z}/{x}/{y}.png?apiKey=f64474b4ab9d2f6bacb2f30d4680e8ae'
		})
	});

	$scope.map = new ol.Map({
		target: 'map_display',
		layers: [
			osm,
			openaip
		],
		view: new ol.View({
			center: ol.proj.fromLonLat([-88.0, 42.0]),
			zoom: 7,
			enableRotation: false
		})
	});

	// Dynamic MBTiles layers
	$http.get(URL_GET_TILESETS).then(function(response) {
		var tilesets = angular.fromJson(response.data);
		for (let file in tilesets) {
			let meta = tilesets[file];
			let name = (meta.name ? meta.name : file);
			let baselayer = meta.type && meta.type == 'baselayer';
			let format = meta.format ? meta.format : 'png';
			let minzoom = meta.minzoom ? parseInt(meta.minzoom) : 1;
			let maxzoom = meta.maxzoom ? parseInt(meta.maxzoom) : 18;
			let styleurl = meta.stratux_style_url

			let ext = [-180, -85, 180, 85];
			if (meta.bounds) {
				ext = meta.bounds.split(',').map(Number)
			}
			ext = ol.proj.transformExtent(ext, 'EPSG:4326', 'EPSG:3857')

			let layer = undefined;
			if (format.toLowerCase() == 'pbf') {
				const vt = new ol.layer.VectorTile({
					title: name,
					type: baselayer ? 'base' : 'overlay',
					extent: ext,
					source: new ol.source.VectorTile({
						url: URL_GET_TILE + '/' + file  + '/{z}/{x}/{-y}.' + format,
						format: new ol.format.MVT(),
						maxZoom: maxzoom,
						minZoom: minzoom,
					})
				});
				if (styleurl) {
					fetch(styleurl).then(function(response) {
						response.json().then(function(style) {
							olms.stylefunction(vt, style, meta.id);
						});
					});
				}
				layer = vt;
			} else {
				layer = new ol.layer.Tile({
					title: name,
					type: baselayer ? 'base' : 'overlay',
					extent: ext,
					source: new ol.source.XYZ({
						url: URL_GET_TILE + '/' + file  + '/{z}/{x}/{-y}.' + format,
						maxZoom: maxzoom,
						minZoom: minzoom,
					})
				});
			}
			if (baselayer)
				$scope.map.getLayers().insertAt(0, layer);
			else
				$scope.map.addLayer(layer);
		}
		$scope.map.addLayer(aircraftSymbolsLayer);
		$scope.map.addLayer(aircraftTrailsLayer);
		$scope.map.addLayer(metarSymbolLayer);

		// Restore layer visibility
		$scope.map.getLayers().forEach((layer) => {
			const title = layer.get('title');
			if (!title) return;
			const key = 'stratux.map.layers.' + title + '.visible';
			const oldState = localStorage.getItem(key);
			if (oldState) {
				layer.setVisible((oldState === 'true'));
			}
		});

		// listener to remember enabled layers
		$scope.map.getLayers().forEach((layer) => {
			layer.on('change:visible', (ev) => {
				const title = ev.target.get('title');
				if (!title) return;
				const visible = ev.target.get('visible');
				const key = 'stratux.map.layers.' + title + '.visible';
				localStorage.setItem(key, visible);
			});
		});
	});
	let aircraftSymbolsLayer = new ol.layer.Vector({
		title: 'Aircraft symbols',
		source: $scope.aircraftSymbols,
		zIndex: 10
	});
	let aircraftTrailsLayer = new ol.layer.Vector({
		title: 'Aircraft trails 5NM',
		source: $scope.aircraftTrails,
		zIndex: 9
	});

	let metarSymbolLayer = new ol.layer.Vector({
		title: 'METAR symbols',
		source: $scope.metarSymbols,
		zIndex: 7
	});

/*
	$scope.map = new ol.Map({
		target: 'map_display',
		layers: [
			osm,
			openaip
		],
		view: new ol.View({
			center: ol.proj.fromLonLat([-88.0, 42.0]),
			zoom: 7,
			enableRotation: false
		})
	});
*/
	const container = document.getElementById('popup');
	const content = document.getElementById('popup-content');
	const closer = document.getElementById('popup-closer');


	const popup = new ol.Overlay({
	element: container,
	autoPan: true,
	autoPanAnimation: {
		duration: 250
	}
	});
	$scope.map.addOverlay(popup);

	closer.onclick = function () {
	popup.setPosition(undefined);
	closer.blur();
	return false;
	};
	$scope.map.addControl(new ol.control.LayerSwitcher());
	// change mouse cursor when over marker
	$scope.map.on('pointermove', function (e) {
		const hit = $scope.map.hasFeatureAtPixel(e.pixel);
		$scope.map.getTargetElement().style.cursor = hit ? 'pointer' : '';
	});
	$scope.map.on('singleclick', function (evt) {
		let featureFound = false;

		$scope.map.forEachFeatureAtPixel(evt.pixel, function (feature, layer) {
			if (layer && layer.get('title') === 'METAR symbols') {
			const coord = feature.getGeometry().getCoordinates();
			const result = $scope.metarList.find(m => m.marker === feature);
			if (result) {
				html = `
				<div style="text-align: center;">
				<div style="background-color: #cceeff; padding: 4px; border-radius: 4px; display: inline-block;">
					<strong>${result.ICAO}</strong>
					</div><br>
					${result.name || ''}
				</div>
				METAR:<br>
				<pre style="margin:0" font-size: 0.8em;>${result.ICAO} ${result.Data}</pre>
				`;
				if (result.TAF) {
					html = html + `<br><strong>TAF</strong><br><pre style="margin:0" font-size: 0.8em;>${result.TAF}</pre>`
				}
				if (result.WINDS) {
					html = html + `<br><strong>WINDS</strong><br><pre style="margin:0" font-size: 0.8em;>${result.WINDS}</pre>`
				}
				content.innerHTML = html;
				popup.setPosition(coord);
				featureFound = true;
			}
			}
		});

		// If no feature was found under click, close the popup
		if (!featureFound) {
			popup.setPosition(undefined);
			closer.blur();
		}
	});
	$scope.aircraft = [];
	$scope.metarList = [];

	function connect($scope) {
		if (($scope === undefined) || ($scope === null))
			return;  // we are getting called once after clicking away from the status page

		if (($scope.socket === undefined) || ($scope.socket === null)) {
			socket = new WebSocket(URL_TRAFFIC_WS);
			$scope.socket = socket;                  // store socket in scope for enter/exit usage


			$scope.ConnectState = 'Disconnected';

			socket.onopen = function(msg) {
				$scope.ConnectState = 'Connected';
				$scope.$apply();
			};

			socket.onclose = function(msg) {
				$scope.ConnectState = 'Disconnected';
				$scope.$apply();
				if ($scope.socket !== null ) {
					setTimeout(connect, 1000);   // do not set timeout after exit
				}
			};

			socket.onerror = function(msg) {
				// $scope.ConnectStyle = "label-danger";
				$scope.ConnectState = 'Problem';
				$scope.$apply();
			};

			socket.onmessage = function(msg) {
				$scope.onMessage(msg);
			};
		}


		if (($scope.socketgps === undefined) || ($scope.socketgps === null)) {
            var socketgps = new WebSocket(URL_GPS_WS);
            $scope.socketgps = socketgps; // store socket in scope for enter/exit usage


			socketgps.onclose = function (msg) {
				delete $scope.socketgps;
				setTimeout(function() {connect($scope);}, 1000);
			};

  			socketgps.onmessage = function (msg) {
				updateMyLocation(JSON.parse(msg.data));
			};
		}
		if (($scope.socketWeather === undefined) || ($scope.socketWeather === null)) {
			var socketWeather = new WebSocket(URL_WEATHER_WS);
			$scope.socketWeather = socketWeather;

			socketWeather.onclose = function (msg) {
				delete $scope.socketWeather;
				setTimeout(function() {connect($scope);}, 1000);
			};

			socketWeather.onmessage = function (msg) {
				updateWeather(JSON.parse(msg.data));
			};
		}
	}

	/**
		Returns path to SVG icon and bool indicating if it's a rotatable icon (not ballon/skydiver)
	 */
	function createMETARSvg(value) {
		let html = ``;
		return ['img/actype/undef.svg'];
	}
	function getMetarColor(cond) {
		switch (cond) {
			case 0:
				return "#ffffff";
			case 1: // LIFR
				return "#ff00ff";
			case 2: // IFR
				return "#FF0000";
			case 3: // MVFR
				return "#0000ff";
			case 4: // VFR
				return "#10cf20";
			default:
				return "#ffffff";
		}
	}

	function extractTemperature(metar) {
		const tempRegex = /\b(M?\d{2})\/(M?\d{2})\b/;
		const match = metar.match(tempRegex);

		if (!match) return 0;

		const parseTemp = (s) => s.startsWith("M") ? -parseInt(s.slice(1), 10) : parseInt(s, 10);
		const toF = (c) => Math.round((c * 9) / 5 + 32);

		val = toF(parseTemp(match[1]));
		return val;
	}

	function extractWindGroup(metar) {
		const tokens = metar.split(/\s+/);
		const windRegex = /^(\d{3}|VRB)\d{2,3}(G\d{2,3})?(KT|MPS|KMH)$/;

		for (let i = 0; i < tokens.length; i++) {
			if (windRegex.test(tokens[i])) {
				let wind = tokens[i];
				let varDir = null;

				// Check if next token is a variable wind direction (e.g. 180V240)
				if (i + 1 < tokens.length && /^\d{3}V\d{3}$/.test(tokens[i + 1])) {
					varDir = tokens[i + 1];
				}

				return {
					wind,
					varDir
				};
			}
		}

		return null;
	}

	function parseWindGroup(group, varDir = null) {
		const regex = /^(\d{3}|VRB)(\d{2,3})(G(\d{2,3}))?(KT)$/;
		const match = group.match(regex);

		if (!match) return null;

		const parsed = {
			direction: match[1] === "VRB" ? "Variable" : parseInt(match[1], 10),
			speed: parseInt(match[2], 10),
			gust: match[4] ? parseInt(match[4], 10) : null,
			varFrom: null,
			varTo: null
		};

		if (varDir) {
			const varMatch = varDir.match(/^(\d{3})V(\d{3})$/);
			if (varMatch) {
				parsed.varFrom = parseInt(varMatch[1], 10);
				parsed.varTo = parseInt(varMatch[2], 10);
			}
		}

		return parsed;
	}

	function parseFlightCondition(msg, body) {
			if ((msg !== "METAR") && (msg !== "SPECI"))
					return 0;

			// check the visibility: a value preceeding 'SM' which is either a fraction or a whole number
			// we don't care what value of fraction since anything below 1SM is LIFR

			// BTW: now I know why no one wants to parse METARs - ther can be spaces in the numbers ARGH
			// test for special case of 'X X/X'
			var exp = new RegExp("([0-9]) ([0-9])/([0-9])SM");
			var match = exp.exec(body);
			if ((match !== null) && (match.length === 4)) {
					visability = parseInt(match[1]) + (parseInt(match[2]) / parseInt(match[3]));
			} else {
					exp = new RegExp("([0-9/]{1,5}?)SM");
					match = exp.exec(body);
					if (match === null)
							return 4;
					// the only way we have 3 or more characters is if the '/' is present which means we need to do extra checking
					if (match[1].length === 3)
							return 1;
					// do we have a usable visability distance
					var visability = parseInt(match[1]);
					// If not, assume we are VFR
					//if (visability === 0)
					//		return 4;
			}

			// ceiling is at either the BKN or OVC layer
			exp = new RegExp("BKN([0-9]{3})");
			match = exp.exec(body);
			if (match === null) {
					exp = new RegExp("OVC([0-9]{3})");
					match = exp.exec(body);
			}
			var ceiling = 999;
			if (match !== null)
					ceiling = parseInt(match[1]);

			if ((visability > 5) && (ceiling > 30))
					return 4;
			if ((visability >= 3) && (ceiling >= 10))
					return 3;
			if ((visability >= 1) && (ceiling >= 5))
					return 2;
			return 1;
	}

	function createPlaneSvg(aircraft) {
		let html = ``;
		let color = craftService.getTransportColor(aircraft);
		if (aircraft.TargetType === TARGET_TYPE_AIS)
			return ['img/actype/vessel.svg', true];

		switch (aircraft.Emitter_category) {
			case 1:
			case 6:
				return ['img/actype/light.svg', true];
			case 2:
			case 3:
			case 4:
			case 5:
				return ['img/actype/heavy.svg', true];
			case 7:
				return ['img/actype/helicopter.svg', true];
			case 9:
				return ['img/actype/glider.svg', true];
			case 10:
				return ['img/actype/lighter-than-air.svg', false];
			case 11:
			case 12:
				return ['img/actype/skydiver.svg', false];
			default:
				return ['img/actype/undef.svg', true];
		}

		return ['img/actype/undef.svg', true];
	}

	// Converts from degrees to radians.
	function toRadians(degrees) {
		return degrees * Math.PI / 180;
	};

	// Converts from radians to degrees.
	function toDegrees(radians) {
		return radians * 180 / Math.PI;
	}

	function bearing(startLng, startLat, destLng, destLat) {
		startLat = toRadians(startLat);
		startLng = toRadians(startLng);
		destLat = toRadians(destLat);
		destLng = toRadians(destLng);

		y = Math.sin(destLng - startLng) * Math.cos(destLat);
		x = Math.cos(startLat) * Math.sin(destLat) - Math.sin(startLat) * Math.cos(destLat) * Math.cos(destLng - startLng);
		brng = Math.atan2(y, x);
		brng = toDegrees(brng);
		return (brng + 360) % 360;
	}

	function distance(lon1, lat1, lon2, lat2) {
		var R = 6371; // Radius of the earth in km
		var dLat = toRadians(lat2-lat1);  // deg2rad below
		var dLon = toRadians(lon2-lon1);
		var a =
			Math.sin(dLat/2) * Math.sin(dLat/2) +
			Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
			Math.sin(dLon/2) * Math.sin(dLon/2)
			;
		var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
		var d = R * c; // Distance in km
		return d;
	}

	function computeTrackFromPositions(aircraft) {
		let dist = 0;
		let prev = [aircraft.Lng, aircraft.Lat]

		// Scan backwards until we have at least 500m of position data
		for (var i = aircraft.posHistory.length - 1; i >= 0; i--) {
			dist += distance(prev[0], prev[1], aircraft.posHistory[i][0], aircraft.posHistory[i][1]);
			prev = aircraft.posHistory[i];
			if (dist >= 0.5)
				break;
		}
		if (dist != 0 && i >= 0) {
			return bearing(aircraft.posHistory[i][0], aircraft.posHistory[i][1], aircraft.Lng, aircraft.Lat);
		}
		return 0;
	}

	function clipPosHistory(aircraft, maxLenKm) {
		let dist = 0;
		for (var i = aircraft.posHistory.length - 2; i >= 0; i--) {
			let prev = aircraft.posHistory[i+1];
			let curr = aircraft.posHistory[i];
			dist += distance(prev[0], prev[1], curr[0], curr[1]);
			if (dist > maxLenKm)
				break;
		}
		if (i > 0)
			aircraft.posHistory = aircraft.posHistory.slice(i);
	}

	function updateOpacity(aircraft) {
		// For AIS sources we set full opacity for 30 minutes
		let opacity
		if (craftService.isTrafficAged(aircraft)) {
			opacity = 0.0
		} else if (aircraft.TargetType === TARGET_TYPE_AIS) {
			opacity = 1.0;
		} else { // For other sources it's based on seconds
			opacity = 1.0 - (aircraft.Age / TRAFFIC_MAX_AGE_SECONDS);
		}
		aircraft.marker.getStyle().getImage().setOpacity(opacity);
	}



	function updateMetarOpacity(met) {
		let opacity = 1.0 - (met.Age / 1800);
		if (opacity < 0.1) opacity = 0.1;

		const setImageOpacity = (feature) => {
			if (feature && feature.getStyle && feature.getStyle()) {
				const img = feature.getStyle().getImage?.();
				if (img) {
					img.setOpacity(opacity);
				}
			}
		};

		const setTextOpacity = (feature) => {
			if (feature && feature.getStyle && feature.getStyle()) {
				const text = feature.getStyle().getText?.();
				if (text) {
					const fill = text.getFill();
					if (fill) fill.setColor(applyAlpha(fill.getColor(), opacity));
					const stroke = text.getStroke?.();
					if (stroke) stroke.setColor(applyAlpha(stroke.getColor(), opacity));
				}
			}
		};

		// Helper to apply alpha to an rgba or hex color
		function applyAlpha(color, alpha) {
			if (typeof color === 'string') {
				// Assume a CSS color string — try parsing
				let rgba = ol.color.asArray(color);
				rgba[3] = alpha;
				return rgba;
			}
			if (Array.isArray(color)) {
				return [...color.slice(0, 3), alpha];
			}
			return color; // fallback
		}

	}

	function updateVehicleText(aircraft) {
		let text = [];
		if (aircraft.Tail.length > 0)
			text.push(aircraft.Tail);
		if (aircraft.TargetType !== TARGET_TYPE_AIS) {
			text.push(aircraft.Alt + 'ft');
		}
		if (aircraft.Speed_valid && aircraft.Speed>0.1)
			text.push(aircraft.Speed + 'kt')
		aircraft.marker.getStyle().getText().setText(text.join('\n'));
	}

	function updateAircraftTrail(aircraft) {
		if (!aircraft.posHistory || aircraft.posHistory.length < 2)
			return;

		let coords = [];
		for (let c of aircraft.posHistory)
			coords.push(ol.proj.fromLonLat(c));
		coords.push(ol.proj.fromLonLat([aircraft.Lng, aircraft.Lat]));

		let trailFeature = aircraft.trail;
		if (!aircraft.trail) {
			trailFeature = new ol.Feature({
				geometry: new ol.geom.LineString(coords)
			});
			aircraft.trail = trailFeature;
			$scope.aircraftTrails.addFeature(trailFeature);
		} else {
			trailFeature.getGeometry().setCoordinates(coords);
		}
	}

	function isSameAircraft(addr1, addrType1, addr2, addrType2) {
		if (addr1 != addr2)
			return false;
		// Both aircraft have the same address and it is either an ICAO address for both,
		// or a non-icao address for both.
		// 1 = non-icao, everything else = icao
		if ((addrType1 == 1 && addrType2 == 1) || (addrType1 != 1 && addrType2 != 1))
			return true;

		return false;
	}

	$scope.onMessage = function(msg) {
		let aircraft = JSON.parse(msg.data);
		if (!aircraft.Position_valid || craftService.isTrafficAged(aircraft)) {
			return;
		}
		aircraft.receivedTs = Date.now();
		let prevColor = undefined;
		let prevEmitterCat = undefined;

		// It is only a 'real' update, if the traffic's Age actually changes.
		// If it doesn't, don't restart animation (only interpolated position).
		let updateIndex = -1;
		for (let i in $scope.aircraft) {
			if (isSameAircraft($scope.aircraft[i].Icao_addr, $scope.aircraft[i].Addr_type, aircraft.Icao_addr, aircraft.Addr_type)) {
				let oldAircraft = $scope.aircraft[i];
				prevColor = craftService.getTransportColor(oldAircraft);
				prevEmitterCat = oldAircraft.Emitter_category
				aircraft.marker = oldAircraft.marker;
				aircraft.trail = oldAircraft.trail;
				aircraft.posHistory = oldAircraft.posHistory;

				let prevRecordedPos = aircraft.posHistory[aircraft.posHistory.length - 1];
				 // remember one coord each 100m
				if (distance(prevRecordedPos[0], prevRecordedPos[1], aircraft.Lng, aircraft.Lat) > 0.1) {
					aircraft.posHistory.push([aircraft.Lng, aircraft.Lat]);
				}
				// At most 9.25km per aircraft
				aircraft.posHistroy = clipPosHistory(aircraft, 9.25);

				if (!aircraft.Speed_valid) {
					// Compute fake track from last to current position
					aircraft.Track = computeTrackFromPositions(aircraft);
				}
				$scope.aircraft[i] = aircraft;
				updateIndex = i;
			}
		}
		if (updateIndex < 0) {
			$scope.aircraft.push(aircraft);
			aircraft.posHistory = [[aircraft.Lng, aircraft.Lat]];
		}

		let acPosition = [aircraft.Lng, aircraft.Lat];

		if (!aircraft.marker) {
			let offsetY = 40;
			if (aircraft.TargetType === TARGET_TYPE_AIS) {
				offsetY = 20;
			}

			let planeStyle = new ol.style.Style({
				text: new ol.style.Text({
					text: '',
					offsetY: offsetY,
					font: 'bold 1em sans-serif',
					stroke: new ol.style.Stroke({color: 'white', width: 2}),
				})
			});
			let planeFeature = new ol.Feature({
				geometry: new ol.geom.Point(ol.proj.fromLonLat(acPosition))
			});
			planeFeature.setStyle(planeStyle);

			aircraft.marker = planeFeature;
			$scope.aircraftSymbols.addFeature(planeFeature);
		} else {
			aircraft.marker.getGeometry().setCoordinates(ol.proj.fromLonLat(acPosition));
			updateAircraftTrail(aircraft);
		}

		updateVehicleText(aircraft);
		if (!prevColor || prevColor != craftService.getTransportColor(aircraft) || prevEmitterCat != aircraft.Emitter_category) {
			const [icon, rotatable] = createPlaneSvg(aircraft);
			let imageStyle = new ol.style.Icon({
				opacity: 1.0,
				src: icon,
				rotation: rotatable ? aircraft.Track : 0,
				anchor: [0.5, 0.5],
				anchorXUnits: 'fraction',
				anchorYUnits: 'fraction',
				color: craftService.getTransportColor(aircraft)
			});
			aircraft.marker.getStyle().setImage(imageStyle); // to update the color if latest source changed
		}
		updateOpacity(aircraft);
		aircraft.marker.getStyle().getImage().setRotation(toRadians(aircraft.Track));
	}

	$scope.updateMetarAges = function() {
		let now = Date.now();
		for (let met of $scope.metarList) {
			if (met.ageRx)
			{
				met.Age = (now - met.ageRx) / 1000.0;
//				console.log(`updateMetarAge of ${met.ICAO} to ${met.Age}`);
			}
 		}
	}

	$scope.updateAges = function() {
		let now = Date.now();
		for (let ac of $scope.aircraft) {
			// Remember the "Age" value when we received the traffic
			if (!ac.ageReceived)
				ac.ageReceived = ac.Age;
			ac.Age = ac.ageReceived + (now - ac.receivedTs) / 1000.0;
			updateOpacity(ac);
		}
	}

	$scope.removeStaleMetars = function() {
		let now = Date.now();
		for (let i = $scope.metarList.length - 1; i >= 0; i--) {
			let met = $scope.metarList[i];
//			console.log(`Age of ${met.ICAO} is ${met.Age}`);
//			console.log(met);
			if (met.Age) {
				if (met.Age > 1800) {
//					console.log(`Age here was ${met.Age}`);
					if (met.marker !== undefined)
					{
						$scope.metarSymbols.removeFeature(met.marker);
						met.marker = undefined;
					}
//					console.log(`Deleting station ${met.ICAO}`);
					$scope.metarList.splice(i,1);
					} else {
//						updateMetarOpacity(met);
					}

				}
			}
		}


	$scope.removeStaleTraffic = function() {
		let now = Date.now();
		for (let i = 0; i < $scope.aircraft.length; i++) {
			let aircraft = $scope.aircraft[i];
			if (craftService.isTrafficAged(aircraft)) {
				if (aircraft.marker)
					$scope.aircraftSymbols.removeFeature(aircraft.marker);
				if (aircraft.trail)
					$scope.aircraftTrails.removeFeature(aircraft.trail);
				$scope.aircraft.splice(i, 1);
				i--;
			}
		}
	}

	$scope.update = function() {

		$scope.updateAges();
		$scope.updateMetarAges();
		$scope.removeStaleTraffic();
		$scope.removeStaleMetars();
	}

	function updateMyLocation(msg) {
		const lat = msg.GPSLatitude;
		const lon = msg.GPSLongitude;
		const fix = msg.GPSFixQuality
		if (fix <= 0)
			return;

		const layer = getOrCreateGpsLayer(lat, lon);
		const source = layer.getSource();

		const geom = new ol.geom.Point(ol.proj.fromLonLat([lon, lat]));
		source.getFeatures()[0].setGeometry(geom);
	}

	function findAirportByICAO(icao) {
		return aplist.find(airport => airport.title === icao) ||
		aplist.find(airport => "K" + airport.title === icao) ||
		null;
	}

	function updateMetarLocation(location, lat, lng, data) {
		const layer = getOrCreateMetarLayer(lat, lng);
		const source = layer.getSource();

		const geom = new ol.geom.Point(ol.proj.fromLonLat([lng, lat]));
		source.getFeatures()[0].setGeometry(geom);
	}

	function formatGusts(spd, gst) {
		str = "";
		if ((gst) && (gst != spd)) {
			str = `G${gst}`;
		}
		return str;
	}

	function formatWinds(dir, spd, gst) {
		str = `${dir}@${spd}`;
		if ((gst) && (gst != spd)) {
			str = str + `G${gst}`
		}
		return str;
	}

	function splitMETAR(metar) {
		return metar.trim().split(/\s+/);
	}
	function appendStringWithSpace(str, token) {
		if (str.length>0)
			str += " ";
		str += token;
		return str;
	}

	function getConditionWords(metar) {
		let retstr="";
		let afterRemark = false;
		const words = splitMETAR(metar);
		for (const token of words) {
			if (token.includes("RMK")) { afterRemark=true; return retstr; }
			if ((token.includes("RA")) && (!afterRemark)) {  retstr=appendStringWithSpace(retstr,token) }
			if ((token.includes("SN")) && (!token.includes("TSNO"))&& (!token.includes("DSNT"))) { retstr += "SN"; return retstr }
			if ((token.includes("TS")) && (!afterRemark)) {  retstr=appendStringWithSpace(retstr,token) }
			if (token.includes("HZ")) { retstr=appendStringWithSpace(retstr,"HZ");  }
			if (token.includes("FG")) { retstr=appendStringWithSpace(retstr,"FG");  }
			if (token.includes("FU")) { retstr=appendStringWithSpace(retstr,"FU"); }
		}
		return retstr;
	}

	function hasLightning(metar) {
		let afterRemark = false;
		const words = splitMETAR(metar);
		for (const token of words) {
			if (token.includes("RMK")) { afterRemark=true; }
			if ((token.includes("LTG")) && (afterRemark)) { return true }
		}
		return false;
	}

	function updateWeather(msg) {
		let now = Date.now();
		const msgType = msg.Type;
		msgLocation = msg.Location;
		const msgTime = msg.Time;
		const msgData = msg.Data;
//		console.log("Received weather update type " + msgType + ". location is: " + msgLocation + " text:\n " + msgData);
		if ((msgType == "WINDS")) {
			// its a Wind report
			msgLocation = "K" + msgLocation;
			const result = findAirportByICAO(msgLocation);
			if (result) {
				result.ageRx=now;
				result.ICAO = msgLocation;
				result.WINDS = msgLocation + " " + msgData;
				let updateIndex = -1;

				for (let i in $scope.metarList) {
					if ($scope.metarList[i].ICAO == result.ICAO) {
						$scope.metarList[i] = result;
						updateIndex = i;
					}
				}
				if (updateIndex < 0) {
					$scope.metarList.push(result);
				}
//				console.log("Added WINDS to " + msgLocation + " Index " + updateIndex);
			}
		}
		if ((msgType == "TAF") || (msgType == "TAF.AMD")) {
			// its a TAF
			const result = findAirportByICAO(msgLocation);
			if (result) {
				result.ageRx=now;
				result.ICAO = msgLocation;
				result.TAF = msgLocation + " " + msgData;
				let updateIndex = -1;

				for (let i in $scope.metarList) {
					if ($scope.metarList[i].ICAO == result.ICAO) {
						$scope.metarList[i] = result;
						updateIndex = i;
					}
				}
				if (updateIndex < 0) {
					$scope.metarList.push(result);
				}
//				console.log("Added TAF to " + msgLocation + " Index " + updateIndex);
			}
		}
		if ((msgType == "METAR") || (msgType == "SPECI")) {
			const result = findAirportByICAO(msgLocation);
			if (result) {

				result.ageRx=now;
				result.ICAO = msgLocation;
				result.Data = msgLocation + " " + msgData;
				let updateIndex = -1;

				for (let i in $scope.metarList) {
					if ($scope.metarList[i].ICAO == result.ICAO) {
						let oldMetar = $scope.metarList[i];
						$scope.metarList[i] = result;
						updateIndex = i;
					}
				}

				if (updateIndex < 0) {
					$scope.metarList.push(result);
				}
				let windDir = 0;
				let windSpeed = 0;
				let windGust = 0;
				const winddata = extractWindGroup(msgData);
				if (winddata) {
					const parsed = parseWindGroup(winddata.wind, winddata.varDir)
					const { direction, speed, gust } = parsed;
					windDir = direction;
					windSpeed = speed;
					windGust = gust;
					dirRadians = toRadians(direction);
//					console.log(`Parsed winds for ${msgLocation} to be ${direction}@${speed}`);
//					console.log(parsed);
				}
				else {
					dirRadians = 0;
				}
				//  + "\n" + formatGusts(windSpeed, windGust),
				let metarPosition = [result.lng, result.lat];
				const metarCoords = ol.proj.fromLonLat(metarPosition);

				ourTemp = extractTemperature(msgData);
				const tempColor = ourTemp <= 32 ? 'blue' : 'red';
				// Get the condition hit words
				condWords = getConditionWords(msgData);
				if ((windGust > 0) && (windGust != windSpeed)) {
					const gustWords = `G${windGust}`;
					const gustRotation = toRadians(30);
				}


				const cond = parseFlightCondition(msgType, msgData);
				const icon = createMETARSvg(0);
				const mcolor = getMetarColor(cond);
				if (!result.marker) {
					const f = MetarIcon.metarMarker([result.lng, result.lat], {
						color: getMetarColor(cond),
						windSpeed,
						windGust: windGust || 0,
						windDirection: windDir || 0,
						stationName: result.ICAO,
						temperature: ourTemp,
						conditions: condWords,
						Lightning: hasLightning(msgData) ? 1 : 0,
						Snowing: 0 //condWords.includes('SN') ? 1 : 0
					}, { useLonLat: true });

					$scope.metarSymbols.addFeature(f);
					result.marker = f;
				} else {
					result.marker.getGeometry().setCoordinates(ol.proj.fromLonLat([result.lng, result.lat]));
				}

			} else {
				console.log("Airport " + msgLocation + " not found!!!");
			}
		}
//{"Type":"METAR","Location":"KGEZ","Time":"061953Z","Data":"AUTO 21013G20KT 10SM FEW120 31/22 A2992 RMK AO2  \n     SLP124 T03060222=\n","LocaltimeReceived":"0001-01-03T20:58:08.22Z"
	}

	function getOrCreateGpsLayer(lat, lon) {
		if ($scope.gpsLayer)
			return $scope.gpsLayer;

		pos = ol.proj.fromLonLat([lon, lat])
		$scope.map.setView(new ol.View({
			center: pos,
			zoom: 10,
			enableRotation: false
		}));


		$scope.gpsLayer = new ol.layer.Vector({
			source: new ol.source.Vector({
				features: [
					new ol.Feature({
						geometry: new ol.geom.Point(pos),
						name: 'Your GPS position'
					})
				]
			}),
			style: new ol.style.Style({
				text: new ol.style.Text({
					text: '\uf041',
					font: 'normal 35px FontAwesome',
					textBaseline: 'bottom'
				})
			})
		});
		$scope.map.addLayer($scope.gpsLayer);
		return $scope.gpsLayer;
	}

	$state.get('map').onExit = function () {
		// disconnect from the socket
		if (($scope.socket !== undefined) && ($scope.socket !== null)) {
			$scope.socket.close();
			$scope.socket = null;
		}
		if ($scope.socketgps) {
		}
		if ($scope.socketWeather)
		{
			$scope.socketgps.close();
			$scope.socketgps = null;
		}
		// stop stale traffic cleanup
		$interval.cancel($scope.update);
	}

	connect($scope);

	let updateInterval = $interval($scope.update, 1000);

	$scope.$on('$destroy', function () {
		// disconnect from the socket
		console.log("Destroying MapCtrl, closing sockets...");
		if (($scope.socket !== undefined) && ($scope.socket !== null)) {
			$scope.socket.close();
			$scope.socket = null;
		}
		if ($scope.socketgps) {
		}
		if ($scope.socketWeather)
		{
			$scope.socketWeather.close();
			$scope.socketWeather = null;
		}
		// stop stale traffic cleanup
		console.log("Stopping update interval");
		$interval.cancel(updateInterval);
	});


}
