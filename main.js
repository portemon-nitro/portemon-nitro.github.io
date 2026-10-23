// biome-ignore lint/style/noExcessiveLinesPerFile: the page intentionally keeps its interaction logic in one script
if ("scrollRestoration" in globalThis.history) {
	globalThis.history.scrollRestoration = "manual";
}
globalThis.scrollTo(0, 0);

const HANDHELD_WIDTH = 256;
const HANDHELD_HEIGHT = 192;
const PAGE_GUTTER = 48;
const BREAKOUT_DISTANCE_VIEWPORTS = 1.65;
const INITIAL_STAGE_TOP_RATIO = 0.4;
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
const PAN_DURATION_MS = 9000;
// Focus is a source pixel anchored at a target fraction of the stage width and
// of the height above the dialogue box. The image always covers `region`, a
// stage fraction matching each legend's CSS mask. New Bark takes its scale
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
		narrowTarget: { x: 0.5, y: 0.3 },
		narrowRegion: { left: 0, top: 0, right: 1, bottom: 0.5 },
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

	const sceneLayers = Array.from(
		document.querySelectorAll(".scene:not(.scene--newbark), .scene-blackout"),
	);
	const sceneShots = SCENE_SHOTS.map((shot) => ({
		...shot,
		image: document.querySelector(shot.selector),
	})).filter((shot) => shot.image instanceof HTMLElement);
	const panStartTimes = new Map();

	function getPanOffset(axis, stageSize, progress) {
		if (!axis) {
			return 0;
		}
		const amount = Math.min(axis.max, axis.ratio * stageSize);
		return amount * (axis.from + (axis.to - axis.from) * progress);
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
	// past the scene resets it.
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

	// Scales the screenshot down as far as it can while still covering its
	// region, keeping every game pixel a whole number of device pixels.
	function placeShot(shot, stage, focusHeight) {
		const narrow = stage.width <= LEGENDS_NARROW_MAX_WIDTH;
		let { target } = shot;
		if (narrow && shot.narrowTarget) {
			target = shot.narrowTarget;
		}
		let region = shot.region ?? FULL_STAGE;
		if (narrow) {
			region = shot.narrowRegion ?? FULL_STAGE;
		}
		const panProgress = getPanProgress(shot);

		const pixelRatio = globalThis.devicePixelRatio || 1;
		const regionLeft = region.left * stage.width;
		const regionRight = region.right * stage.width;
		const regionTop = region.top * stage.height;
		const regionBottom = region.bottom * stage.height;
		let scaleWidth = regionRight - regionLeft;
		let scaleHeight = regionBottom - regionTop;
		if (shot.scalesWithViewport) {
			scaleWidth = Math.max(scaleWidth, globalThis.innerWidth);
			scaleHeight = Math.max(scaleHeight, globalThis.innerHeight);
		}
		const devicePixelsPerGamePixel = Math.max(
			1,
			Math.ceil(
				Math.max(scaleWidth / GAME_WIDTH, scaleHeight / GAME_HEIGHT) *
					pixelRatio -
					SCALE_EPSILON,
			),
		);
		const scale =
			devicePixelsPerGamePixel / (SOURCE_PIXELS_PER_GAME_PIXEL * pixelRatio);
		const width = GAME_WIDTH * SOURCE_PIXELS_PER_GAME_PIXEL * scale;
		const height = GAME_HEIGHT * SOURCE_PIXELS_PER_GAME_PIXEL * scale;
		const left = snapEdge(
			stage.width * target.x -
				scale * shot.focus.x +
				getPanOffset(shot.pan?.x, stage.width, panProgress),
			regionRight - width,
			regionLeft,
			stage.left,
		);
		const top = snapEdge(
			focusHeight * target.y -
				scale * shot.focus.y +
				getPanOffset(shot.pan?.y, stage.height, panProgress),
			regionBottom - height,
			regionTop,
			stage.top,
		);
		shot.image.style.transform = `translate3d(${left - stage.width / 2}px, ${top - stage.height / 2}px, 0) scale(${scale})`;
	}

	function placeShots(dialogueTop) {
		const stage = sceneSurface.getBoundingClientRect();
		for (const shot of sceneShots) {
			let focusHeight = stage.height;
			if (shot.clearsDialogue !== false) {
				focusHeight = Math.min(stage.height, dialogueTop);
			}
			placeShot(shot, stage, focusHeight);
		}
	}

	// Keeps the title centered on the stage until the stage scrolls away, then
	// pins it near the top until the stage's black bottom edge pushes it out.
	function placeOutroTitle() {
		if (
			!(outroPanel instanceof HTMLElement && outroTitle instanceof HTMLElement)
		) {
			return;
		}
		const panelRect = outroPanel.getBoundingClientRect();
		const titleHeight = outroTitle.offsetHeight;
		const centeredTop = panelRect.top + (panelRect.height - titleHeight) / 2;
		const pinnedTop = Math.min(
			Math.max(centeredTop, globalThis.innerHeight * OUTRO_TITLE_PIN_TOP_RATIO),
			panelRect.bottom - titleHeight,
		);
		story.style.setProperty(
			"--outro-title-shift",
			`${pinnedTop - centeredTop}px`,
		);
	}

	// Cues hold one boolean per layer in paint order; CSS times each fade.
	// Returns whether a pan is still running and needs another frame.
	function updateScenes(layerCues, titleCue, dialogueTop) {
		const now = globalThis.performance.now();
		sceneLayers.forEach((layer, index) => {
			const entered = Boolean(layerCues[index]);
			if (!entered) {
				panStartTimes.delete(layer);
			} else if (!panStartTimes.has(layer)) {
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

		function renderDialogueVisual() {
			const heading = dialogueHeadingByState[requestedDialogueState] ?? "";
			dialogueVisualHeading.textContent = displayedDialogueText.slice(
				0,
				heading.length,
			);

			const bodyDisplayed = displayedDialogueText.slice(
				heading.length + DIALOGUE_SECTION_SEPARATOR.length,
			);
			const listLines = dialogueListLinesByState[requestedDialogueState];
			const noteLines = dialogueNoteLinesByState[requestedDialogueState] ?? [];
			const noteSegments =
				dialogueNoteSegmentsByState[requestedDialogueState] ?? [];

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
		});
		dialogueHeightObserver.observe(dialogueBox);

		function updateDialogue() {
			const viewportHeight = Math.max(1, globalThis.innerHeight);
			const dialogueBoxRect = dialogueBox.getBoundingClientRect();
			const settledTop = Number.parseFloat(getComputedStyle(dialogueBox).top);
			if (
				!dialogueStarted &&
				dialogueBoxRect.top <= settledTop &&
				dialogueBoxRect.bottom > 0
			) {
				dialogueStarted = true;
				requestDialogueState("planned-features");
			}

			if (!dialogueStarted) {
				return;
			}

			const regionHeight = Math.max(
				1,
				dialogueRegion.offsetHeight - viewportHeight,
			);
			const dialogueProgress = clamp(
				-dialogueRegion.getBoundingClientRect().top / regionHeight,
				0,
				1,
			);
			if (
				requestedDialogueState === "planned-features" &&
				dialogueProgress >= DIALOGUE_CRAZY_ENTER_THRESHOLD
			) {
				requestDialogueState("going-crazy");
			} else if (
				requestedDialogueState === "going-crazy" &&
				dialogueProgress >= DIALOGUE_RECRUITMENT_ENTER_THRESHOLD
			) {
				requestDialogueState("recruitment");
			} else if (
				requestedDialogueState === "going-crazy" &&
				dialogueProgress < DIALOGUE_CRAZY_EXIT_THRESHOLD
			) {
				requestDialogueState("planned-features");
			} else if (
				requestedDialogueState === "recruitment" &&
				dialogueProgress < DIALOGUE_RECRUITMENT_EXIT_THRESHOLD
			) {
				requestDialogueState("going-crazy");
			}
		}

		function updateLayout() {
			updateDialogue();

			if (motionPreference.matches) {
				updateStaticScene();
				return;
			}

			const viewportWidth = Math.max(1, globalThis.innerWidth);
			const viewportHeight = Math.max(1, globalThis.innerHeight);
			const containedWidth = Math.min(
				HANDHELD_WIDTH,
				Math.max(1, viewportWidth - PAGE_GUTTER),
			);
			const containedHeight =
				containedWidth * (HANDHELD_HEIGHT / HANDHELD_WIDTH);
			const horizontalInset = Math.max(0, (viewportWidth - containedWidth) / 2);
			const initialTop = clamp(
				viewportHeight * INITIAL_STAGE_TOP_RATIO - containedHeight / 2,
				0,
				Math.max(0, viewportHeight - containedHeight),
			);
			const progress = clamp(
				-story.getBoundingClientRect().top /
					(BREAKOUT_DISTANCE_VIEWPORTS * viewportHeight),
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
				`${Math.max(0, viewportHeight - initialTop - containedHeight) * insetScale}px`,
			);
			visualStage.style.setProperty(
				"--stage-inset-left",
				`${horizontalInset * insetScale}px`,
			);
			if (updateSceneCues()) {
				scheduleLayoutUpdate();
			}
		}

		// Scenes follow the dialogue box: Ecruteak once it settles, the legends
		// and Dragon's Den with its second and third messages, black once it
		// starts scrolling away, and the title once it has passed above it.
		function updateSceneCues() {
			const dialogueBoxRect = dialogueBox.getBoundingClientRect();
			const settledTop = Number.parseFloat(getComputedStyle(dialogueBox).top);
			const titleTop = outroTitle?.getBoundingClientRect().top ?? 0;
			const dialogueLeaving =
				dialogueBoxRect.top < settledTop - STICKY_TOLERANCE_PX;
			return updateScenes(
				[
					dialogueBoxRect.top <= settledTop + STICKY_TOLERANCE_PX,
					requestedDialogueState === "going-crazy" ||
						requestedDialogueState === "recruitment",
					requestedDialogueState === "recruitment",
					dialogueLeaving,
				],
				dialogueLeaving && dialogueBoxRect.bottom <= titleTop,
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

		updateLayout();
		globalThis.addEventListener("scroll", scheduleLayoutUpdate, {
			passive: true,
		});
		globalThis.addEventListener("resize", scheduleLayoutUpdate);
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
