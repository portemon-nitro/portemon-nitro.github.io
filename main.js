// biome-ignore lint/style/noExcessiveLinesPerFile: the page intentionally keeps its interaction logic in one script
if ("scrollRestoration" in globalThis.history) {
	globalThis.history.scrollRestoration = "manual";
}
globalThis.scrollTo(0, 0);

const HANDHELD_WIDTH = 256;
const HANDHELD_HEIGHT = 192;
const PAGE_GUTTER = 48;
const BREAKOUT_DISTANCE_VIEWPORTS = 1.05;
const INITIAL_STAGE_TOP_RATIO = 0.5;
// The handheld frame shows this many game pixels across, at the shot's scale.
const HANDHELD_GAME_PIXELS_WIDE = 192;
const HANDHELD_MAX_HEIGHT_RATIO = 0.5;
const SMOOTHSTEP_SCALE = 3;
// Screenshots are 512x288 game pixels captured at 5x.
const SOURCE_PIXELS_PER_GAME_PIXEL = 5;
const GAME_WIDTH = 512;
const GAME_HEIGHT = 288;
const SCALE_EPSILON = 1e-6;
const LEGENDS_NARROW_MAX_WIDTH = 699;
const OUTRO_TITLE_PIN_TOP_RATIO = 0.08;
const STAGE_CENTER = { x: 0.5, y: 0.5 };
const FULL_STAGE = { left: 0, top: 0, right: 1, bottom: 1 };
const SCENE_ENTERED_CLASS = "scene--entered";
const STICKY_TOLERANCE_PX = 1;
const DIALOGUE_WIDTH_CHANGE_THRESHOLD_PX = 0.5;
const PAN_DURATION_MS = 9000;
// Focus is a source pixel anchored at a target fraction of the stage width and
// of the height above the dialogue box. The image always covers `region`, a
// stage fraction matching each legend's CSS mask; an `aboveDialogue` region
// measures its vertical fractions on the height above the dialogue box. New Bark takes its scale
// from the viewport so it stays still while the handheld frame expands. Once a scene starts fading
// in, it pans once by min(max, ratio * stage size) CSS pixels, from the
// `from` multiple to the `to` multiple.
const SCENE_SHOTS = [
	{
		selector: ".scene--newbark img",
		focus: { x: 1230, y: 700 },
		target: STAGE_CENTER,
		clearsDialogue: false,
		scalesWithViewport: true,
	},
	{
		selector: ".scene--ecutreak img",
		focus: { x: 1220, y: 690 },
		target: STAGE_CENTER,
		pan: {
			x: { max: 24, ratio: 0.015, from: 1, to: -1 },
			y: { max: 12, ratio: 0.01, from: 1, to: -1 },
		},
	},
	{
		selector: ".legend--hooh img",
		focus: { x: 1280, y: 600 },
		target: { x: 0.3, y: 0.5 },
		region: { left: 0, top: 0, right: 0.65, bottom: 1 },
		narrowTarget: { x: 0.5, y: 0.25 },
		narrowRegion: {
			left: 0,
			top: 0,
			right: 1,
			bottom: 1,
			aboveDialogue: true,
		},
		pan: {
			y: { max: 32, ratio: 0.03, from: -1, to: 1 },
		},
	},
	{
		selector: ".legend--lugia img",
		focus: { x: 1255, y: 680 },
		target: { x: 0.7, y: 0.5 },
		region: { left: 0.35, top: 0, right: 1, bottom: 1 },
		narrowTarget: { x: 0.5, y: 0.75 },
		pan: {
			y: { max: 32, ratio: 0.03, from: 1, to: -1 },
		},
	},
	{
		selector: ".scene--dragonsden img",
		focus: { x: 1430, y: 600 },
		target: STAGE_CENTER,
		pan: {
			x: { max: 24, ratio: 0.015, from: 1, to: -1 },
			y: { max: 20, ratio: 0.02, from: 0, to: -1 },
		},
	},
];
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const TYPEWRITER_CHARACTER_DELAY_MS = 30;
const DIALOGUE_CRAZY_ENTER_THRESHOLD = 0.35;
const DIALOGUE_CRAZY_EXIT_THRESHOLD = 0.25;
const DIALOGUE_RECRUITMENT_ENTER_THRESHOLD = 0.7;
const DIALOGUE_RECRUITMENT_EXIT_THRESHOLD = 0.6;
const DIALOGUE_SNAP_POSITION_THRESHOLD_PX = 0.5;
// The box fades to black with the scenes while still pinned, before the end
// of its region would scroll it away.
const DIALOGUE_FADE_THRESHOLD = 0.9;
const DIALOGUE_FADED_CLASS = "dialogue-box--faded";
const DIALOGUE_SECTION_SEPARATOR = "\n\n";
const DIALOGUE_MESSAGE_COUNT = 3;
const LEADING_WHITESPACE_PATTERN = /^\s+/u;
const TRAILING_WHITESPACE_PATTERN = /\s+$/u;
const FAVICON_SPRITE_SRC = "/favicon/ethan.png";
const FAVICON_SIZE = 32;
const FAVICON_TILE_SIZE = 32;
const FAVICON_CROP_X = 5;
const FAVICON_CROP_Y = 8;
const FAVICON_CROP_WIDTH = 21;
const FAVICON_CROP_HEIGHT = 22;
const FAVICON_ANIMATION_START_FRAME = 4;
const FAVICON_ANIMATION_FRAME_COUNT = 4;
const FAVICON_FRAME_INTERVAL_MS = 300;

const story = document.querySelector(".story");
const visualStage = document.querySelector(".story__visual");
const sceneSurface = document.querySelector(".scene-surface");
const outroPanel = document.querySelector(".story__outro-panel");
const outroTitle = document.querySelector(".story__outro-title");
const dialogueRegion = document.querySelector(".story__dialogue-region");
const dialogueBox = document.querySelector(".dialogue-box");
const dialogueVisual = document.querySelector(".dialogue-box__visual");
const dialogueVisualHeading = document.querySelector(
	".dialogue-box__visual-heading",
);
const dialogueVisualBody = document.querySelector(".dialogue-box__visual-body");
const dialogueVisualNote = document.querySelector(".dialogue-box__visual-note");
const semanticMessages = Array.from(
	document.querySelectorAll("[data-dialogue-message]"),
).filter((message) => message instanceof HTMLElement);

if (
	story instanceof HTMLElement &&
	visualStage instanceof HTMLElement &&
	sceneSurface instanceof HTMLElement
) {
	const motionPreference = globalThis.matchMedia(REDUCED_MOTION_QUERY);
	let layoutFrameId = 0;

	function clamp(value, minimum, maximum) {
		return Math.min(Math.max(value, minimum), maximum);
	}

	const smallViewportProbe = document.createElement("div");
	smallViewportProbe.className =
		"viewport-height-probe viewport-height-probe--small";
	smallViewportProbe.setAttribute("aria-hidden", "true");
	const largeViewportProbe = document.createElement("div");
	largeViewportProbe.className =
		"viewport-height-probe viewport-height-probe--large";
	largeViewportProbe.setAttribute("aria-hidden", "true");
	visualStage.append(smallViewportProbe, largeViewportProbe);
	let viewportGeometry;

	function measureViewportGeometry() {
		const stageRect = visualStage.getBoundingClientRect();
		const measuredSmallHeight =
			smallViewportProbe.getBoundingClientRect().height;
		const measuredLargeHeight =
			largeViewportProbe.getBoundingClientRect().height;
		if (
			![
				measuredSmallHeight,
				measuredLargeHeight,
				stageRect.width,
				stageRect.height,
			].every((value) => Number.isFinite(value) && value > 0)
		) {
			return viewportGeometry;
		}

		const stageWidth = stageRect.width;
		return {
			stageWidth,
			stageHeight: stageRect.height,
			smallHeight: measuredSmallHeight,
			largeHeight: Math.max(measuredSmallHeight, measuredLargeHeight),
		};
	}

	const sceneLayers = Array.from(
		document.querySelectorAll(".scene:not(.scene--newbark), .scene-blackout"),
	);
	const sceneShots = SCENE_SHOTS.map((shot) => ({
		...shot,
		image: document.querySelector(shot.selector),
	})).filter((shot) => shot.image instanceof HTMLElement);
	const panStartTimes = new Map();
	// Pans reset only once their scene has fully faded out, so the jump back to
	// the start stays hidden.
	for (const layer of sceneLayers) {
		layer.addEventListener("transitionend", () => {
			if (!layer.classList.contains(SCENE_ENTERED_CLASS)) {
				panStartTimes.delete(layer);
			}
		});
	}

	// Sizes the initial handheld frame from the full-screen shot's game pixel
	// size, so larger screens show more of New Bark at the same scale.
	function getHandheldSize(viewportWidth, smallHeight) {
		const gamePixelSize =
			getCoverScale(viewportWidth, smallHeight) * SOURCE_PIXELS_PER_GAME_PIXEL;
		const width = Math.min(
			HANDHELD_GAME_PIXELS_WIDE * gamePixelSize,
			Math.max(1, viewportWidth - PAGE_GUTTER),
			smallHeight *
				HANDHELD_MAX_HEIGHT_RATIO *
				(HANDHELD_WIDTH / HANDHELD_HEIGHT),
		);
		return { width, height: width * (HANDHELD_HEIGHT / HANDHELD_WIDTH) };
	}

	function getPanRange(axis, stageSize) {
		if (!axis) {
			return 0;
		}
		const amount = Math.min(axis.max, axis.ratio * stageSize);
		return amount * Math.abs(axis.to - axis.from);
	}

	// Positions an image edge so the whole pan stays within the bounds, moving
	// the anchor or shrinking the pan when there isn't enough room, so every
	// pan runs for its full duration instead of stopping at an edge.
	function getPannedEdge(bounds, axis, stageSize, progress) {
		let from = 0;
		let to = 0;
		if (axis) {
			const amount = Math.min(axis.max, axis.ratio * stageSize);
			from = amount * axis.from;
			to = amount * axis.to;
		}
		const lowest = Math.min(from, to);
		const highest = Math.max(from, to);
		const room = Math.max(0, bounds.maximum - bounds.minimum);
		let fit = 1;
		if (highest - lowest > room) {
			fit = room / (highest - lowest);
		}
		const anchor = clamp(
			bounds.edge,
			bounds.minimum - lowest * fit,
			bounds.maximum - highest * fit,
		);
		return anchor + (from + (to - from) * progress) * fit;
	}

	// Returns the image scale covering width x height with every game pixel
	// spanning a whole number of device pixels.
	function getCoverScale(width, height) {
		const pixelRatio = globalThis.devicePixelRatio || 1;
		const devicePixelsPerGamePixel = Math.max(
			1,
			Math.ceil(
				Math.max(width / GAME_WIDTH, height / GAME_HEIGHT) * pixelRatio -
					SCALE_EPSILON,
			),
		);
		return (
			devicePixelsPerGamePixel / (SOURCE_PIXELS_PER_GAME_PIXEL * pixelRatio)
		);
	}

	function snapToDevicePixel(edge, stageOrigin, round) {
		const pixelRatio = globalThis.devicePixelRatio || 1;
		return round((stageOrigin + edge) * pixelRatio) / pixelRatio - stageOrigin;
	}

	// Places a stage-relative image edge within [minimum, maximum] on the
	// viewport's device-pixel grid, so nearest-neighbor sampling stays uniform.
	function snapEdge(value, minimum, maximum, stageOrigin) {
		return Math.min(
			snapToDevicePixel(maximum, stageOrigin, Math.floor),
			Math.max(
				snapToDevicePixel(minimum, stageOrigin, Math.ceil),
				snapToDevicePixel(value, stageOrigin, Math.round),
			),
		);
	}

	// Pans ease out over a fixed time once their scene enters; scrolling back
	// past the scene resets it after it fades out.
	function getPanProgress(shot) {
		const startTime = panStartTimes.get(shot.image.closest(".scene"));
		if (startTime === undefined) {
			return 0;
		}
		const progress = clamp(
			(globalThis.performance.now() - startTime) / PAN_DURATION_MS,
			0,
			1,
		);
		return 1 - (1 - progress) ** SMOOTHSTEP_SCALE;
	}

	// Resolves the stage area, in CSS pixels, that the image must cover.
	function getShotRegion(shot, stage, focusHeight) {
		let region = shot.region ?? FULL_STAGE;
		if (stage.width <= LEGENDS_NARROW_MAX_WIDTH) {
			region = shot.narrowRegion ?? FULL_STAGE;
		}
		let regionHeight = stage.height;
		if (region.aboveDialogue) {
			regionHeight = focusHeight;
		}
		return {
			left: region.left * stage.width,
			right: region.right * stage.width,
			top: region.top * regionHeight,
			bottom: region.bottom * regionHeight,
		};
	}

	// Scales the screenshot down as far as it can while still covering its
	// region, keeping every game pixel a whole number of device pixels.
	function placeShot(shot, stage, focusHeight, largeHeight) {
		const narrow = stage.width <= LEGENDS_NARROW_MAX_WIDTH;
		let { target } = shot;
		if (narrow && shot.narrowTarget) {
			target = shot.narrowTarget;
		}
		const {
			left: regionLeft,
			right: regionRight,
			top: regionTop,
			bottom: regionBottom,
		} = getShotRegion(shot, stage, focusHeight);
		const panProgress = getPanProgress(shot);

		let scaleWidth = regionRight - regionLeft;
		let scaleHeight = regionBottom - regionTop;
		if (shot.scalesWithViewport) {
			scaleWidth = Math.max(scaleWidth, viewportGeometry.stageWidth);
			scaleHeight = Math.max(scaleHeight, largeHeight);
		}
		// Leave room for the pan so exact fits still move.
		scaleWidth += getPanRange(shot.pan?.x, stage.width);
		scaleHeight += getPanRange(shot.pan?.y, stage.height);
		const scale = getCoverScale(scaleWidth, scaleHeight);
		const width = GAME_WIDTH * SOURCE_PIXELS_PER_GAME_PIXEL * scale;
		const height = GAME_HEIGHT * SOURCE_PIXELS_PER_GAME_PIXEL * scale;
		const leftBounds = { minimum: regionRight - width, maximum: regionLeft };
		const topBounds = { minimum: regionBottom - height, maximum: regionTop };
		const left = snapEdge(
			getPannedEdge(
				{ ...leftBounds, edge: stage.width * target.x - scale * shot.focus.x },
				shot.pan?.x,
				stage.width,
				panProgress,
			),
			leftBounds.minimum,
			leftBounds.maximum,
			stage.left,
		);
		const top = snapEdge(
			getPannedEdge(
				{ ...topBounds, edge: focusHeight * target.y - scale * shot.focus.y },
				shot.pan?.y,
				stage.height,
				panProgress,
			),
			topBounds.minimum,
			topBounds.maximum,
			stage.top,
		);
		shot.image.style.transform = `translate3d(${left - stage.width / 2}px, ${top - stage.height / 2}px, 0) scale(${scale})`;
	}

	function placeShots(dialogueTop) {
		const stage = sceneSurface.getBoundingClientRect();
		sceneSurface.style.setProperty(
			"--dialogue-clearance",
			`${Math.min(stage.height, dialogueTop)}px`,
		);
		for (const shot of sceneShots) {
			let focusHeight = stage.height;
			if (shot.clearsDialogue !== false) {
				focusHeight = Math.min(stage.height, dialogueTop);
			}
			placeShot(shot, stage, focusHeight, viewportGeometry.largeHeight);
		}
	}

	// Keeps the title centered on the stage until the stage scrolls away, then
	// pins it near the top with matching space above and below. The final menu
	// leaves that band on screen when the page is scrolled to the end.
	function placeOutroTitle() {
		if (
			!(outroPanel instanceof HTMLElement && outroTitle instanceof HTMLElement)
		) {
			return;
		}
		const panelRect = outroPanel.getBoundingClientRect();
		const titleHeight = outroTitle.offsetHeight;
		const centeredTop = panelRect.top + (panelRect.height - titleHeight) / 2;
		const pinMargin = viewportGeometry.smallHeight * OUTRO_TITLE_PIN_TOP_RATIO;
		const pinnedTop = Math.min(
			Math.max(centeredTop, pinMargin),
			panelRect.bottom - titleHeight - pinMargin,
		);
		story.style.setProperty(
			"--outro-title-shift",
			`${pinnedTop - centeredTop}px`,
		);
		document.documentElement.style.setProperty(
			"--outro-title-band",
			`${titleHeight + 2 * pinMargin}px`,
		);
	}

	// Cues hold one boolean per layer in paint order; CSS times each fade.
	// Returns whether a pan is still running and needs another frame.
	function updateScenes(layerCues, titleCue, dialogueTop) {
		const now = globalThis.performance.now();
		sceneLayers.forEach((layer, index) => {
			const entered = Boolean(layerCues[index]);
			if (entered && !panStartTimes.has(layer) && layer.querySelector("img")) {
				panStartTimes.set(layer, now);
			}
			layer.classList.toggle(SCENE_ENTERED_CLASS, entered);
		});
		story.style.setProperty("--outro-opacity", String(Number(titleCue)));
		story.style.setProperty("--outro-panel-background", "transparent");
		placeShots(dialogueTop);
		placeOutroTitle();
		return Array.from(panStartTimes.values()).some(
			(startTime) => now - startTime < PAN_DURATION_MS,
		);
	}

	// Reduced motion keeps only the CSS-pinned New Bark hero and a static outro.
	function updateStaticScene() {
		story.style.removeProperty("--outro-opacity");
		story.style.removeProperty("--outro-panel-background");
		story.style.removeProperty("--outro-title-shift");
		document.documentElement.style.removeProperty("--outro-title-band");
		for (const layer of sceneLayers) {
			layer.classList.remove(SCENE_ENTERED_CLASS);
		}
		panStartTimes.clear();
		placeShots(Number.POSITIVE_INFINITY);
	}

	function wait(duration) {
		return new Promise((resolve) => {
			globalThis.setTimeout(resolve, duration);
		});
	}

	function getMessageHeading(message) {
		return message.querySelector("h2")?.textContent.trim() ?? "";
	}

	function getMessageListLines(message) {
		const listItems = Array.from(message.querySelectorAll("li"), (item) =>
			item.textContent.trim(),
		);
		if (listItems.length === 0) {
			return null;
		}
		return listItems.map((item) => `• ${item}`);
	}

	function getMessageNoteLines(message) {
		return Array.from(message.querySelectorAll("p"), (paragraph) =>
			paragraph.textContent.trim(),
		);
	}

	function getMessageNoteSegments(message) {
		return Array.from(message.querySelectorAll("p"), (paragraph) => {
			const segments = Array.from(paragraph.childNodes)
				.filter(
					(node) =>
						node.nodeType === Node.TEXT_NODE ||
						(node.nodeType === Node.ELEMENT_NODE && node.tagName === "A"),
				)
				.map((node) => {
					if (node.nodeType === Node.ELEMENT_NODE) {
						return { text: node.textContent, href: node.getAttribute("href") };
					}
					return { text: node.textContent };
				});

			if (segments.length > 0) {
				segments[0].text = segments[0].text.replace(
					LEADING_WHITESPACE_PATTERN,
					"",
				);
				const lastSegment = segments.at(-1);
				lastSegment.text = lastSegment.text.replace(
					TRAILING_WHITESPACE_PATTERN,
					"",
				);
			}

			return segments.filter((segment) => segment.text.length > 0);
		});
	}

	function getMessageBody(message) {
		const listLines = getMessageListLines(message);
		const noteLines = getMessageNoteLines(message);
		const parts = [];
		if (listLines) {
			parts.push(listLines.join("\n"));
		}
		if (noteLines.length > 0) {
			parts.push(noteLines.join("\n"));
		}
		return parts.join(DIALOGUE_SECTION_SEPARATOR);
	}

	if (
		dialogueRegion instanceof HTMLElement &&
		dialogueBox instanceof HTMLElement &&
		dialogueVisual instanceof HTMLElement &&
		dialogueVisualHeading instanceof HTMLElement &&
		dialogueVisualBody instanceof HTMLElement &&
		dialogueVisualNote instanceof HTMLElement &&
		semanticMessages.length === DIALOGUE_MESSAGE_COUNT
	) {
		const dialogueHeadingByState = Object.fromEntries(
			semanticMessages.map((message) => [
				message.dataset.dialogueMessage,
				getMessageHeading(message),
			]),
		);
		const dialogueListLinesByState = Object.fromEntries(
			semanticMessages.map((message) => [
				message.dataset.dialogueMessage,
				getMessageListLines(message),
			]),
		);
		const dialogueNoteLinesByState = Object.fromEntries(
			semanticMessages.map((message) => [
				message.dataset.dialogueMessage,
				getMessageNoteLines(message),
			]),
		);
		const dialogueNoteSegmentsByState = Object.fromEntries(
			semanticMessages.map((message) => [
				message.dataset.dialogueMessage,
				getMessageNoteSegments(message),
			]),
		);
		const dialogueTextByState = Object.fromEntries(
			semanticMessages.map((message) => [
				message.dataset.dialogueMessage,
				getMessageHeading(message) +
					DIALOGUE_SECTION_SEPARATOR +
					getMessageBody(message),
			]),
		);
		const dialogueSnapTargets = Array.from(
			dialogueRegion.querySelectorAll("[data-dialogue-snap]"),
		);
		const dialogueSnapProgressByState = new Map([
			["planned-features", 0],
			["going-crazy", DIALOGUE_CRAZY_ENTER_THRESHOLD],
			["recruitment", DIALOGUE_RECRUITMENT_ENTER_THRESHOLD],
		]);
		let requestedDialogueState = "empty";
		let displayedDialogueText = "";
		let dialogueOperationActive = false;
		let dialogueStarted = false;
		let dialogueVisualItemElements = [];

		function getTargetDialogueText() {
			return dialogueTextByState[requestedDialogueState] ?? "";
		}

		function ensureDialogueVisualItemCount(count) {
			while (dialogueVisualItemElements.length < count) {
				const item = document.createElement("div");
				item.className = "dialogue-box__visual-item";
				dialogueVisualBody.append(item);
				dialogueVisualItemElements.push(item);
			}
			while (dialogueVisualItemElements.length > count) {
				dialogueVisualItemElements.pop()?.remove();
			}
		}

		function renderDialogueVisualList(listLines, bodyDisplayed) {
			dialogueVisualBody.style.setProperty(
				"--dialogue-list-rows",
				String(Math.ceil(listLines.length / 2)),
			);
			ensureDialogueVisualItemCount(listLines.length);

			let lineStart = 0;
			listLines.forEach((line, index) => {
				if (index > 0) {
					lineStart += 1;
				}
				const typedLength = clamp(
					bodyDisplayed.length - lineStart,
					0,
					line.length,
				);
				dialogueVisualItemElements[index].textContent = line.slice(
					0,
					typedLength,
				);
				lineStart += line.length;
			});
		}

		function renderDialogueVisualNote(noteSegmentsByLine, noteDisplayed) {
			const segments = [];
			noteSegmentsByLine.forEach((lineSegments, index) => {
				if (index > 0) {
					segments.push({ text: "\n" });
				}
				segments.push(...lineSegments);
			});

			dialogueVisualNote.replaceChildren();
			let consumed = 0;
			for (const segment of segments) {
				const shown = segment.text.slice(0, noteDisplayed.length - consumed);
				if (shown.length > 0) {
					if (segment.href) {
						const link = document.createElement("a");
						link.href = segment.href;
						link.target = "_blank";
						link.rel = "noopener noreferrer";
						link.tabIndex = -1;
						link.textContent = shown;
						dialogueVisualNote.append(link);
					} else {
						dialogueVisualNote.append(document.createTextNode(shown));
					}
				}
				consumed += segment.text.length;
				if (consumed >= noteDisplayed.length) {
					break;
				}
			}
		}

		function renderDialogueVisual(
			state = requestedDialogueState,
			displayedText = displayedDialogueText,
		) {
			const heading = dialogueHeadingByState[state] ?? "";
			dialogueVisualHeading.textContent = displayedText.slice(
				0,
				heading.length,
			);

			const bodyDisplayed = displayedText.slice(
				heading.length + DIALOGUE_SECTION_SEPARATOR.length,
			);
			const listLines = dialogueListLinesByState[state];
			const noteLines = dialogueNoteLinesByState[state] ?? [];
			const noteSegments = dialogueNoteSegmentsByState[state] ?? [];

			dialogueVisual.classList.toggle(
				"dialogue-box__visual--columns",
				Boolean(listLines),
			);
			dialogueVisualBody.hidden = !listLines;
			dialogueVisualNote.hidden = noteLines.length === 0;

			if (listLines) {
				const listTarget = listLines.join("\n");
				renderDialogueVisualList(
					listLines,
					bodyDisplayed.slice(0, listTarget.length),
				);
				const noteDisplayed = bodyDisplayed.slice(
					listTarget.length + DIALOGUE_SECTION_SEPARATOR.length,
				);
				renderDialogueVisualNote(noteSegments, noteDisplayed);
				return;
			}

			dialogueVisualItemElements = [];
			dialogueVisualBody.replaceChildren();
			renderDialogueVisualNote(noteSegments, bodyDisplayed);
		}

		// Sizes the box for its tallest message up front, so typing never grows it.
		function reserveDialogueHeight() {
			dialogueVisual.style.minHeight = "";
			let tallest = 0;
			for (const [state, text] of Object.entries(dialogueTextByState)) {
				renderDialogueVisual(state, text);
				tallest = Math.max(
					tallest,
					dialogueVisual.getBoundingClientRect().height,
				);
			}
			renderDialogueVisual();
			dialogueVisual.style.minHeight = `${tallest}px`;
		}

		async function typeNextDialogueCharacter() {
			if (displayedDialogueText === getTargetDialogueText()) {
				return;
			}

			if (motionPreference.matches) {
				displayedDialogueText = getTargetDialogueText();
				renderDialogueVisual();
				return;
			}

			const targetText = getTargetDialogueText();
			displayedDialogueText += targetText.charAt(displayedDialogueText.length);
			renderDialogueVisual();
			await wait(TYPEWRITER_CHARACTER_DELAY_MS);
			return typeNextDialogueCharacter();
		}

		async function reconcileDialogue() {
			if (dialogueOperationActive) {
				return;
			}

			dialogueOperationActive = true;
			try {
				await typeNextDialogueCharacter();
			} finally {
				dialogueOperationActive = false;
				if (displayedDialogueText !== getTargetDialogueText()) {
					reconcileDialogue();
				}
			}
		}

		function requestDialogueState(nextState) {
			if (requestedDialogueState === nextState) {
				return;
			}

			requestedDialogueState = nextState;
			if (motionPreference.matches) {
				displayedDialogueText = getTargetDialogueText();
				renderDialogueVisual();
				return;
			}

			displayedDialogueText = "";
			renderDialogueVisual();
			reconcileDialogue();
		}

		const dialogueHeightObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				dialogueRegion.style.setProperty(
					"--dialogue-height",
					`${entry.target.getBoundingClientRect().height}px`,
				);
			}
			// Scene focus and the narrow legends seam depend on the box height.
			scheduleLayoutUpdate();
		});
		dialogueHeightObserver.observe(dialogueBox);

		function getDialogueProgress() {
			const regionHeight = Math.max(
				1,
				dialogueRegion.offsetHeight - viewportGeometry.smallHeight,
			);
			return clamp(
				-dialogueRegion.getBoundingClientRect().top / regionHeight,
				0,
				1,
			);
		}

		function updateDialogue() {
			const dialogueBoxRect = dialogueBox.getBoundingClientRect();
			const settledTop = Number.parseFloat(getComputedStyle(dialogueBox).top);
			if (
				!dialogueStarted &&
				dialogueBoxRect.top <= settledTop + STICKY_TOLERANCE_PX &&
				dialogueBoxRect.bottom > 0
			) {
				dialogueStarted = true;
			}

			if (!dialogueStarted) {
				return;
			}

			const dialogueProgress = getDialogueProgress();
			let currentState = requestedDialogueState;
			if (currentState === "empty") {
				currentState = "planned-features";
			}
			requestDialogueState(
				getNextDialogueState(dialogueProgress, currentState),
			);
		}

		function getNextDialogueState(progress, currentState) {
			if (
				progress >= DIALOGUE_RECRUITMENT_ENTER_THRESHOLD ||
				(currentState === "recruitment" &&
					progress >= DIALOGUE_RECRUITMENT_EXIT_THRESHOLD)
			) {
				return "recruitment";
			}
			if (
				progress >= DIALOGUE_CRAZY_ENTER_THRESHOLD ||
				((currentState === "going-crazy" || currentState === "recruitment") &&
					progress >= DIALOGUE_CRAZY_EXIT_THRESHOLD)
			) {
				return "going-crazy";
			}
			return "planned-features";
		}

		function updateLayout() {
			viewportGeometry = measureViewportGeometry() ?? viewportGeometry;
			if (!viewportGeometry) {
				return;
			}
			positionDialogueSnapTargets();
			updateDialogue();

			if (motionPreference.matches) {
				dialogueBox.classList.remove(DIALOGUE_FADED_CLASS);
				updateStaticScene();
				return;
			}

			const { stageWidth, stageHeight, smallHeight } = viewportGeometry;
			const { width: containedWidth, height: containedHeight } =
				getHandheldSize(stageWidth, smallHeight);
			const horizontalInset = Math.max(0, (stageWidth - containedWidth) / 2);
			const initialTop = clamp(
				smallHeight * INITIAL_STAGE_TOP_RATIO - containedHeight / 2,
				0,
				Math.max(0, smallHeight - containedHeight),
			);
			const progress = clamp(
				-story.getBoundingClientRect().top /
					(BREAKOUT_DISTANCE_VIEWPORTS * smallHeight),
				0,
				1,
			);
			const easedProgress =
				progress * progress * (SMOOTHSTEP_SCALE - 2 * progress);
			const insetScale = 1 - easedProgress;

			story.style.setProperty("--breakout-progress", String(progress));
			visualStage.style.setProperty(
				"--stage-inset-top",
				`${initialTop * insetScale}px`,
			);
			visualStage.style.setProperty(
				"--stage-inset-right",
				`${horizontalInset * insetScale}px`,
			);
			visualStage.style.setProperty(
				"--stage-inset-bottom",
				`${Math.max(0, stageHeight - initialTop - containedHeight) * insetScale}px`,
			);
			visualStage.style.setProperty(
				"--stage-inset-left",
				`${horizontalInset * insetScale}px`,
			);
			if (updateSceneCues()) {
				scheduleLayoutUpdate();
			}
		}

		function positionDialogueSnapTargets() {
			const dialogueTravel = Math.max(
				1,
				dialogueRegion.offsetHeight - viewportGeometry.smallHeight,
			);
			for (const target of dialogueSnapTargets) {
				const progress = dialogueSnapProgressByState.get(
					target.dataset.dialogueSnap,
				);
				if (progress !== undefined) {
					const top = progress * dialogueTravel;
					const currentTop = Number.parseFloat(target.style.top);
					if (
						!Number.isFinite(currentTop) ||
						Math.abs(currentTop - top) > DIALOGUE_SNAP_POSITION_THRESHOLD_PX
					) {
						target.style.top = `${top}px`;
					}
				}
			}
		}

		// Scenes follow the dialogue box: Ecruteak once it settles, the legends
		// and Dragon's Den with its second and third messages, black as the box
		// fades out near the end of its region, and the title once the faded box
		// starts scrolling away.
		function updateSceneCues() {
			const dialogueBoxRect = dialogueBox.getBoundingClientRect();
			const settledTop = Number.parseFloat(getComputedStyle(dialogueBox).top);
			const dialogueFaded = getDialogueProgress() >= DIALOGUE_FADE_THRESHOLD;
			dialogueBox.classList.toggle(DIALOGUE_FADED_CLASS, dialogueFaded);
			return updateScenes(
				[
					dialogueBoxRect.top <= settledTop + STICKY_TOLERANCE_PX,
					requestedDialogueState === "going-crazy" ||
						requestedDialogueState === "recruitment",
					requestedDialogueState === "recruitment",
					dialogueFaded,
				],
				dialogueBoxRect.top < settledTop - STICKY_TOLERANCE_PX,
				settledTop,
			);
		}

		function scheduleLayoutUpdate() {
			if (layoutFrameId !== 0) {
				return;
			}

			layoutFrameId = globalThis.requestAnimationFrame(() => {
				layoutFrameId = 0;
				updateLayout();
			});
		}

		let lastReservedDialogueWidth = 0;

		function handleViewportResize() {
			const dialogueWidth = dialogueBox.getBoundingClientRect().width;
			if (
				Number.isFinite(dialogueWidth) &&
				dialogueWidth > 0 &&
				Math.abs(dialogueWidth - lastReservedDialogueWidth) >
					DIALOGUE_WIDTH_CHANGE_THRESHOLD_PX
			) {
				reserveDialogueHeight();
				lastReservedDialogueWidth = dialogueWidth;
			}
			scheduleLayoutUpdate();
		}

		reserveDialogueHeight();
		lastReservedDialogueWidth = dialogueBox.getBoundingClientRect().width;
		updateLayout();
		globalThis.addEventListener("resize", handleViewportResize);
		globalThis.visualViewport?.addEventListener("resize", handleViewportResize);
		const stageResizeObserver = new ResizeObserver(handleViewportResize);
		stageResizeObserver.observe(visualStage);
		document.fonts
			.load('400 16px "Pokemon DS"')
			.catch(() => undefined)
			.then(() => {
				reserveDialogueHeight();
				lastReservedDialogueWidth = dialogueBox.getBoundingClientRect().width;
				scheduleLayoutUpdate();
			});
		globalThis.addEventListener("scroll", scheduleLayoutUpdate, {
			passive: true,
		});
		motionPreference.addEventListener("change", scheduleLayoutUpdate);
	}
}

// Animated favicon

const favicon = document.querySelector("#favicon");
const sprite = new Image();

sprite.src = FAVICON_SPRITE_SRC;

function buildFaviconFrame(canvas, ctx, frame) {
	ctx.clearRect(0, 0, FAVICON_SIZE, FAVICON_SIZE);

	// Scale up as much as possible while preserving aspect ratio.
	const scale = Math.min(
		FAVICON_SIZE / FAVICON_CROP_WIDTH,
		FAVICON_SIZE / FAVICON_CROP_HEIGHT,
	);
	const destW = Math.floor(FAVICON_CROP_WIDTH * scale);
	const destH = Math.floor(FAVICON_CROP_HEIGHT * scale);
	const destX = Math.floor((FAVICON_SIZE - destW) / 2);
	const destY = Math.floor((FAVICON_SIZE - destH) / 2);

	ctx.drawImage(
		sprite,
		frame * FAVICON_TILE_SIZE + FAVICON_CROP_X, // source x
		FAVICON_CROP_Y, // source y
		FAVICON_CROP_WIDTH, // source width
		FAVICON_CROP_HEIGHT, // source height
		destX, // dest x
		destY, // dest y
		destW, // dest width
		destH, // dest height
	);

	return canvas.toDataURL("image/png");
}

function startFaviconAnimation(frames) {
	favicon.href = frames[0];

	if (globalThis.matchMedia(REDUCED_MOTION_QUERY).matches) {
		return;
	}

	let frameIndex = 0;
	globalThis.setInterval(() => {
		favicon.href = frames[frameIndex];
		frameIndex = (frameIndex + 1) % frames.length;
	}, FAVICON_FRAME_INTERVAL_MS);
}

sprite.addEventListener("load", () => {
	const canvas = document.createElement("canvas");
	canvas.width = FAVICON_SIZE;
	canvas.height = FAVICON_SIZE;

	const ctx = canvas.getContext("2d");
	ctx.imageSmoothingEnabled = false;

	const frames = Array.from(
		{ length: FAVICON_ANIMATION_FRAME_COUNT },
		(_, index) =>
			buildFaviconFrame(canvas, ctx, FAVICON_ANIMATION_START_FRAME + index),
	);
	startFaviconAnimation(frames);
});
