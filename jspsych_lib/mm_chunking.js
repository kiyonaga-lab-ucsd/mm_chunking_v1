/**
 * jspsych-continuous-color
 * plugin for continuous color report using Schurgin et al. color wheel.
 * @author Tim Brady, Janna Wennberg
 * Original code by Tim Brady Dec. 2020, 
 * adapted for jsPsych 7.2 by Janna Wennberg, June 2022
  */


var retrocue_css_added = false;

var jsPsychMMChunking = (function (jsPsych) {

    const info = {
        name: 'continuous-retrocue',
        parameters: {
            stim_types: {
                type: jsPsych.ParameterType.STRING,
                array: true,
                default: ['color', 'color', 'color', 'color'],
                description: "Per-item stimulus type: 'color' or 'orientation'."
            },
            retrocue_indices: {
                type: jsPsych.ParameterType.INT,
                array: true,
                default: [0, 1],
                description: 'Indices of the items (0-indexed) that receive the retro-cue.'
            },
            // Which of the retrocued items is probed (0 or 1 → first or second cued item).
            probe_index: {
                type: jsPsych.ParameterType.INT,
                default: 0,
                description: 'Which retrocued item is probed (0 = first cued, 1 = second cued).'
            },

            // --- Manually specified values (optional; random if empty) ---
            item_values: {
                type: jsPsych.ParameterType.FLOAT,
                array: true,
                default: [],
                description: 'Pre-specified values (color degrees 0-359, or orientation degrees 0-179). Length must equal set_size.'
            },

            // --- Timing (ms) ---
            display_time: { type: jsPsych.ParameterType.INT, default: 750,  description: 'Duration each set of stimuli is shown.' },
            isi_time: { type: jsPsych.ParameterType.INT, default: 500,  description: 'ISI between first and second set.' },
            retrocue_time: { type: jsPsych.ParameterType.INT, default: 750,  description: 'Duration retro-cue is shown.' },
            post_retrocue_delay: { type: jsPsych.ParameterType.INT, default: 500,  description: 'Delay after retro-cue before probe.' },
            iti: { type: jsPsych.ParameterType.INT, default: 1500,  description: 'Inter-trial interval.' },

            // --- Layout ---
            set_size: { type: jsPsych.ParameterType.INT, default: 4,   description: 'Total number of items (must be even).' },
            num_placeholders: { type: jsPsych.ParameterType.INT, default: 4,   description: 'Number of placeholder locations.' },
            item_size: { type: jsPsych.ParameterType.INT, default: 90,  description: 'Diameter of each item circle (px).' },
            radius: { type: jsPsych.ParameterType.INT, default: 160, description: 'Radius of the placeholder ring (px).' },
            line_width: { type: jsPsych.ParameterType.INT, default: 6,   description: 'Width of orientation bar (px).' },
            line_length_frac: { type: jsPsych.ParameterType.FLOAT, default: 0.7, description: 'Fraction of item_size used as bar length.' },

            // --- Color/orientation constraints ---
            min_difference_ori: { type: jsPsych.ParameterType.INT, default: 20,
                description: 'Min angular distance between items of the same type (color or orientation).' },

            min_difference_color: { type: jsPsych.ParameterType.INT, default: 40,
                description: 'Min angular distance between items of the same type (color or orientation).' },

            // --- Wheel ---
            color_wheel_spin: { type: jsPsych.ParameterType.BOOL, default: true,
                description: 'Randomly rotate the color report wheel each trial.' },
            orientation_wheel_spin: { type: jsPsych.ParameterType.BOOL, default: true,
                description: 'Randomly rotate the orientation report wheel each trial.' },

            // --- Feedback ---
            feedback: { type: jsPsych.ParameterType.BOOL, default: false,
                description: 'Show error feedback after response.' },

            // --- Display ---
            bg_color: { type: jsPsych.ParameterType.STRING, default: '#DDDDDD',
                description: 'Background color of the experiment box.' },

            // --- Block / trial metadata (passed through to data) ---
            block_type:   { type: jsPsych.ParameterType.STRING, default: '',
                description: 'Label for the block type (e.g., "color_within").' },
            is_practice:  { type: jsPsych.ParameterType.BOOL, default: false }
        }
    };
    class MMChunkingPlugin {
        constructor(jsPsych) {
            this.jsPsych = jsPsych;
        }

        trial(display_element, trial) {
            // Add CSS once
            if (!retrocue_css_added) {
                const css = `
                    /* Placeholder circles — outline-offset avoids layout shift
                       when the border weight changes at cue/probe time */
                    .rc-placeholder {
                        position: absolute;
                        border-radius: 50%;
                        outline: 2px solid #555;
                        outline-offset: 4px;
                        box-sizing: border-box;
                    }
                    .rc-placeholder.cued   { outline: 4px solid #111; outline-offset: 4px; }
                    .rc-placeholder.probed { outline: 4px solid #111; outline-offset: 4px; }
                    
                    .rc-ori-bar {
                        position: absolute;
                        border-radius: 3px;
                        background: transparent;
                        pointer-events: none;
                        transform-origin: center center;
                    }

                    /* Main experiment box */
                    #rc-box {
                        display: flex;
                        margin: 0 auto;
                        align-items: center;
                        justify-content: center;
                        border: 1px solid #888;
                        position: relative;
                    }

                    /* Fixation cross */
                    #rc-fixation {
                        position: absolute;
                        font-size: 24px;
                        user-select: none;
                        z-index: 10;
                    }

                    /* Feedback / error text */
                    #rc-feedback-label {
                        position: absolute;
                        bottom: 14px;
                        width: 100%;
                        text-align: center;
                        font-family: monospace;
                        font-size: 13px;
                        color: #333;
                        pointer-events: none;
                    }

                    /* Response wheel container */
                    #rc-report-wheel {
                        position: absolute;
                        top: 0; left: 0;
                        width: 100%; height: 100%;
                        pointer-events: none;
                    }

                    /* Guide rings drawn behind the response dots */
                    .rc-ring-guide {
                        position: absolute;
                        border-radius: 50%;
                        border: 2px solid #aaa;
                        pointer-events: none;
                    }

                    /* Color ring dots */
                    .rc-color-dot {
                        width: 20px;
                        height: 20px;
                        border-radius: 50%;
                        position: absolute;
                        cursor: pointer;
                        box-sizing: border-box;
                        pointer-events: all;
                    }
                    .rc-color-dot:hover { transform: scale(1.3); }
                     /* Orientation ring tick marks */
                    .rc-ori-tick {
                        width: 10px;
                        height: 10px;
                        position: absolute;
                        background: #000;
                        border-radius: 10px;
                        cursor: pointer;
                        pointer-events: all;
                    }
                    .rc-ori-tick:hover { background: #000; }
                `;
                const style = document.createElement('style');
                style.textContent = css;
                document.head.appendChild(style);
                retrocue_css_added = true;
            }

            // Build the layout
            const { item_size, radius, num_placeholders, set_size } = trial;
            const boxSize = radius * 2 + item_size * 2 + 100;
            const center  = boxSize / 2;

            // Color ring sits just outside the placeholder ring.
            // Orientation ring sits outside the color ring.
            const colorWheelRadius = radius + item_size + 10;
            const oriWheelRadius   = colorWheelRadius + 30;

            /* ---- Build the HTML ----------------------------------- */
            let html = `<div id="rc-box" style="
                width:${boxSize}px; height:${boxSize}px;
                background:${trial.bg_color};">`;

            for (let i = 0; i < num_placeholders; i++) {
                const angle = (Math.PI * 2 / num_placeholders) * i + Math.PI / 4;
                const top  = center + Math.cos(angle) * radius - item_size / 2;
                const left = center + Math.sin(angle) * radius - item_size / 2;

                // The circle itself (filled for color, transparent for orientation)
                html += `<div id="rc-item-${i}" class="rc-placeholder"
                    style="top:${top}px; left:${left}px;
                           width:${item_size}px; height:${item_size}px;"></div>`;

                // A separate bar div whose center coincides with the circle's center.
                // Sized to 0×0 when not in use so it has no visual impact.
                html += `<div id="rc-ori-${i}" class="rc-ori-bar"
                    style="top:${top + item_size / 2}px;
                           left:${left + item_size / 2}px;
                           width:0; height:0;"></div>`;
            }

            html += `<span id="rc-fixation" style="cursor:pointer">+</span>
                     <div id="rc-feedback-label"></div>
                     <div id="rc-report-wheel"></div>
                     </div>`;

            display_element.innerHTML = html;

            /* ---- Assign values & positions ---- */
            const allPositions = Array.from({ length: num_placeholders }, (_, i) => i);
            const positions = this.jsPsych.randomization.shuffle([...allPositions]).slice(0, set_size);

            const values = trial.item_values.length === set_size
                ? trial.item_values
                : generateValues(trial.stim_types, trial.min_difference_color, trial.min_difference_ori);

            const halfN = set_size / 2;
            const set1Pos = positions.slice(0, halfN);
            const set1Val = values.slice(0, halfN);
            const set1Type = trial.stim_types.slice(0, halfN);
            const set2Pos = positions.slice(halfN);
            const set2Val = values.slice(halfN);
            const set2Type = trial.stim_types.slice(halfN);

            // Retro-cue: map retrocue_indices → positions & values
            const rcPos = trial.retrocue_indices.map(idx => positions[idx]);
            const rcVal = trial.retrocue_indices.map(idx => values[idx]);
            const rcTypes = trial.retrocue_indices.map(idx => trial.stim_types[idx]);

            const probePos = rcPos[trial.probe_index];
            const probeVal = rcVal[trial.probe_index];
            const probeType = rcTypes[trial.probe_index];

            // These are the functions to show/hide/cue AN item
            const showItem = (placeholderIdx, type, value) => {
                const circle = document.getElementById(`rc-item-${placeholderIdx}`);
                const oriBar = document.getElementById(`rc-ori-${placeholderIdx}`);
                if (!circle) return;
                if (type === 'color') {
                    circle.style.backgroundColor = colorFromDeg(value);
                    clearOriBar(oriBar);
                } else {
                    circle.style.backgroundColor = '';
                    setOriBar(oriBar, value, item_size, trial.line_width, trial.line_length_frac);
                }
            };

            const hideItem = (placeholderIdx) => {
                const circle = document.getElementById(`rc-item-${placeholderIdx}`);
                const oriBar = document.getElementById(`rc-ori-${placeholderIdx}`);
                if (!circle) return;
                circle.style.backgroundColor = '';
                clearOriBar(oriBar);
            };

            const setCued = (placeholderIdx, cued) => {
                const el = document.getElementById(`rc-item-${placeholderIdx}`);
                if (!el) return;
                el.classList.toggle('cued', cued);
            };

            // Now these are the functions to actually do it!

            // Show the first two items
            const showSet1 = () => {
                set1Pos.forEach((p, i) => showItem(p, set1Type[i], set1Val[i]));
                setTimeout(hideSet1, trial.display_time)
            };

            // Hide the first two items
            const hideSet1 = () => {
                set1Pos.forEach(p => hideItem(p));
                setTimeout(showSet2, trial.isi_time)
            };

            // Show the second two items
            const showSet2 = () => {
                set2Pos.forEach((p, i) => showItem(p, set2Type[i], set2Val[i]));
                setTimeout(hideSet2, trial.display_time)
            };

            // Hide the second two items
            const hideSet2 = () => {
                set2Pos.forEach(p => hideItem(p));
                setTimeout(showRetrocue, trial.isi_time)
            };

            // Show the retrocue
            const showRetrocue = () => {
                rcPos.forEach(p => setCued(p, true));
                setTimeout(hideRetrocue, trial.retrocue_time)
            };

            // Hide the retrocue until the probe
            const hideRetrocue = () => {
                rcPos.forEach(p => setCued(p, false));
                setTimeout(showProbe, trial.post_retrocue_delay)
            };

            /* ---- Probe + response wheel -------------------------------- */
            let startTime;

            const showProbe = () => {
                startTime = performance.now();
                document.getElementById(`rc-item-${probePos}`).classList.add('probed');
                buildResponseWheel({
                    probeType, probePos, probeVal,
                    colorWheelRadius, oriWheelRadius,
                    center, item_size,
                    line_width:       trial.line_width,
                    line_length_frac: trial.line_length_frac,
                    display_element,
                    onResponse
                });
            };

           /* ---- Response handling ------------------------------------ */
            let trialData = null;

            const onResponse = (reportedValue, reportedFeature) => {
                const rt    = performance.now() - startTime;
                const space = probeType === 'orientation' ? 180 : 360;
                const err   = circularError(reportedValue, probeVal, space);

                trialData = {
                    block_type:          trial.block_type,
                    is_practice:         trial.is_practice,
                    set_size,
                    stim_types:          trial.stim_types,
                    retrocue_indices:    trial.retrocue_indices,
                    probe_index:         trial.probe_index,
                    probe_type:          probeType,
                    probe_pos:           probePos,
                    probe_value:         probeVal,
                    reported_value:      reportedValue,
                    reported_feature:    reportedFeature,   // 'color' or 'orientation'
                    clicked_wrong_wheel: reportedFeature !== probeType,
                    error:               err,
                    rt,
                    all_positions:       positions,
                    all_values:          values,
                    rc_positions:        rcPos,
                    rc_values:           rcVal,
                    display_time:        trial.display_time,
                    isi_time:            trial.isi_time,
                    retrocue_time:       trial.retrocue_time,
                    post_retrocue_delay: trial.post_retrocue_delay,
                };

                if (trial.feedback) {
                    showFeedback({
                        probePos, probeVal, probeType, err, reportedFeature,
                        item_size, line_width: trial.line_width,
                        line_length_frac: trial.line_length_frac
                    });
                    this.jsPsych.pluginAPI.setTimeout(endTrial, 1500);
                } else {
                    this.jsPsych.pluginAPI.setTimeout(endTrial, 100);
                }
            };

            // Wait to start the trial
            var startTrial = () => {
				document.getElementById("rc-fixation").style.cursor = 'auto';
                setTimeout(showSet1, trial.iti);
			};

            // Start the trial
            startTrial()
            
            
            /* End trial and record information:
            -------------------------------- */
            var endTrial = () => {
                display_element.innerHTML = '';
                this.jsPsych.finishTrial(trialData || {});
            };

        }
    }

    /* ================================================================== */
    /*  Helper FUNCTIONS                                                */
    /* ================================================================== */

    // Get color and orientation values with a certain minimum distance
    function generateValues(stimTypes, minDiffColor, minDiffOri) {
        // Generate independently per type, maintaining separation only within same type.
        const colorPicked = [];
        const oriPicked   = [];
        const values      = [];

        for (const t of stimTypes) {
            const space = t === 'color' ? 360 : 180;
            const already = t === 'color' ? colorPicked : oriPicked;
            const minDiff = t === 'color' ? minDiffColor : minDiffOri;
            
            let v = randInt(0, space - 1);
            let tries = 0;
            while (already.some(a => circularDist(v, a, space) < minDiff) && tries < 500) {
                v = randInt(0, space - 1);
                tries++;
            }
            already.push(v);
            values.push(v);
        }
        return values;
    }

     /* ================================================================== */
    /*  Response wheel                                                      */
    /* ================================================================== */
    function buildResponseWheel({
        probeType, probePos, probeVal,
        colorWheelRadius, oriWheelRadius,
        center, item_size,
        line_width, line_length_frac,
        display_element, onResponse
    }) {
        const wheelDiv = document.getElementById('rc-report-wheel');

        // Guide rings
        let html = `
            <div class="rc-ring-guide" style="
                width:${oriWheelRadius * 2}px; height:${oriWheelRadius * 2}px;
                top:${center - oriWheelRadius}px; left:${center - oriWheelRadius}px;"></div>
            <div class="rc-ring-guide" style="
                width:${colorWheelRadius * 2}px; height:${colorWheelRadius * 2}px;
                top:${center - colorWheelRadius}px; left:${center - colorWheelRadius}px;"></div>`;

        // ---- Outer orientation ring (0–179°) ----
        // Each orientation value maps to one tick, placed at its doubled angle on
        // 0=horizontal / 90=vertical
        for (let i = 0; i < 180; i++) {
            const rad = i / 180 * Math.PI;
            const top  = center - Math.sin(rad) * oriWheelRadius - 10;
            const left = center + Math.cos(rad) * oriWheelRadius - 10;
            html += `<div class="rc-ori-tick"
                data-value="${i}" data-feature="orientation"
                style="top:${top}px; left:${left}px;
                    width:20px; height:20px; border-radius:50%;
                    background:rgb(20,20,20);"></div>`;
        }

        // ---- Inner color ring (0–359°) ----
        for (let i = 0; i < 360; i++) {
            const rgb = getColorRGB(i);
            const { top, left } = polarToPx(i, colorWheelRadius, center, 10, 10);
            html += `<div class="rc-color-dot"
                data-value="${i}" data-feature="color"
                style="top:${top}px; left:${left}px;
                       background:rgb(${rgb[0]},${rgb[1]},${rgb[2]});"></div>`;
        }

        wheelDiv.innerHTML = html;

        // Boundary between the two ring zones (midpoint between their radii)
        const midRadius    = (colorWheelRadius + oriWheelRadius) / 2;
        const innerBound   = colorWheelRadius  - item_size * 0.4;
        const outerBound   = oriWheelRadius    + item_size * 0.4;

        const probeCircle = document.getElementById(`rc-item-${probePos}`);
        const probeOriBar = document.getElementById(`rc-ori-${probePos}`);

        /* Live hover preview in probe placeholder */
        const updatePreview = (e) => {
            const rect = display_element.querySelector('#rc-box').getBoundingClientRect();
            const relX = e.clientX - rect.left - center;
            const relY = e.clientY - rect.top  - center;
            const dist  = Math.sqrt(relX * relX + relY * relY);
            const angle = wrapAngle(Math.atan2(relY, relX) / Math.PI * 180, 360);

            if (dist >= midRadius && dist <= outerBound && relY < 0) {
                // Over ori ring - show ori preview
                probeCircle.style.backgroundColor = '';
                // atan2 gives screen angle (y-down), negate relY to convert to math convention
                const mathAngle = wrapAngle(Math.atan2(-relY, relX) / Math.PI * 180, 180);
                setOriBar(probeOriBar, Math.round(mathAngle), item_size, line_width, line_length_frac);
                
            } else if (dist >= innerBound && dist < midRadius) {
                // Over color ring — show color preview
                clearOriBar(probeOriBar);
                probeCircle.style.backgroundColor = colorFromDeg(Math.round(angle));
            } else {
                // Outside both rings — clear preview
                probeCircle.style.backgroundColor = '';
                clearOriBar(probeOriBar);
            }
        };
        document.addEventListener('mousemove', updatePreview);

        /* Click to respond */
        const allDots = wheelDiv.querySelectorAll('.rc-color-dot, .rc-ori-tick');
        const handleClick = function () {
            document.removeEventListener('mousemove', updatePreview);
            allDots.forEach(d => d.removeEventListener('click', handleClick));
            onResponse(
                parseInt(this.getAttribute('data-value')),
                this.getAttribute('data-feature')
            );
        };
        allDots.forEach(d => d.addEventListener('click', handleClick));
    }


    /* ================================================================== */
    /*  Orientation bar helpers                                             */
    /* ================================================================== */

    // orientDeg: 0 = horizontal, 90 = vertical (standard convention).
    // CSS rotate(0) = vertical (12 o'clock), so we add 90° to convert.
    function setOriBar(barEl, orientDeg, itemSize, lineWidth, lenFrac) {
        const len = itemSize * lenFrac;
        barEl.style.width           = `${lineWidth}px`;
        barEl.style.height          = `${len}px`;
        barEl.style.marginLeft      = `${-lineWidth / 2}px`;
        barEl.style.marginTop       = `${-len / 2}px`;
        barEl.style.backgroundColor = '#222';
        barEl.style.transform       = `rotate(${-orientDeg + 90}deg)`;
    }

    function clearOriBar(barEl) {
        barEl.style.backgroundColor = '';
        barEl.style.width           = '0';
        barEl.style.height          = '0';
    }

    /* ================================================================== */
    /*  Feedback                                                            */
    /* ================================================================== */
    function showFeedback({
        probePos, probeVal, probeType, err, reportedFeature,
        item_size, line_width, line_length_frac
    }) {
        const circle = document.getElementById(`rc-item-${probePos}`);
        const oriBar = document.getElementById(`rc-ori-${probePos}`);
        const label  = document.getElementById('rc-fixation');

        if (reportedFeature !== probeType) {
            if (label) label.textContent = 'Wrong wheel — correct answer shown.';
        } else {
            if (label) label.textContent = `Error: ${Math.abs(err)}°`;
        }

        // Always reveal the correct answer in the probe placeholder
        if (probeType === 'color') {
            clearOriBar(oriBar);
            circle.style.backgroundColor = colorFromDeg(probeVal);
        } else {
            circle.style.backgroundColor = '';
            setOriBar(oriBar, probeVal, item_size, line_width, line_length_frac);
        }
    }


    /* ================================================================== */
    /*  Math helpers                                                        */
    /* ================================================================== */
    function circularError(reported, target, space) {
        let err = reported - target;
        while (err >  space / 2) err -= space;
        while (err < -space / 2) err += space;
        return Math.round(err);
    }

    function circularDist(a, b, space) {
        const d = Math.abs(a - b) % space;
        return Math.min(d, space - d);
    }

    // Wrap v into [0, space)
    function wrapAngle(v, space) {
        return ((v % space) + space) % space;
    }

    function randInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // Convert polar angle (degrees, 0 = 3 o'clock) to pixel top/left,
    // centering a dot of half-size dotHalfW × dotHalfH.
    function polarToPx(angleDeg, r, center, dotHalfW, dotHalfH) {
        const rad = angleDeg / 180 * Math.PI;
        return {
            top:  center + Math.sin(rad) * r - dotHalfH,
            left: center + Math.cos(rad) * r - dotHalfW,
        };
    }
    /* ================================================================== */
    /*  Color wheel                                                         */
    /* ================================================================== */
    function colorFromDeg(deg) {
        deg = ((deg % 360) + 360) % 360;
        const rgb = getColorRGB(deg);
        return `rgb(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])})`;
    }

    // Schurgin et al. color wheel lookup table (360 entries)
    function getColorRGB(deg) {
        const colorsList = [
            [246,37,111],[246,37,110],[246,37,109],[246,37,107.5],[246,37,106],
            [246,37,104.5],[246,37,103],[246,37.5,102],[246,38,101],[246,38.5,99.5],
            [246,39,98],[246,39.5,96.5],[246,40,95],[246,41,94],[246,42,93],
            [245.5,42.5,91.5],[245,43,90],[245,44,89],[245,45,88],[245,46,86.5],
            [245,47,85],[244.5,47.5,84],[244,48,83],[243.5,49,81.5],[243,50,80],
            [242.5,51,79],[242,52,78],[242,53,76.5],[242,54,75],[241.5,55.5,74],
            [241,57,73],[240.5,58,71.5],[240,59,70],[239,60,69],[238,61,68],
            [237.5,62,66.5],[237,63,65],[236.5,64,64],[236,65,63],[235.5,66,62],
            [235,67,61],[234,68.5,60],[233,70,59],[232.5,71,57.5],[232,72,56],
            [231,73,55],[230,74,54],[229,75,53],[228,76,52],[227.5,77,51],
            [227,78,50],[226,79,49],[225,80,48],[224,81,46.5],[223,82,45],
            [222,83,44],[221,84,43],[220,85,42],[219,86,41],[218,87,40],
            [217,88,39],[216,89,38],[215,90,37],[214,91,36.5],[213,92,36],
            [212,93,35],[211,94,34],[210,95,33],[209,96,32],[208,97,31],
            [207,98,30],[205.5,98.5,29.5],[204,99,29],[203,100,28],[202,101,27],
            [201,102,26.5],[200,103,26],[198.5,103.5,25],[197,104,24],[196,105,23.5],
            [195,106,23],[194,107,22.5],[193,108,22],[191.5,108.5,21.5],[190,109,21],
            [189,110,20.5],[188,111,20],[186.5,111.5,19.5],[185,112,19],[183.5,113,19],
            [182,114,19],[181,114.5,19],[180,115,19],[178.5,115.5,19],[177,116,19],
            [176,117,19],[175,118,19],[173.5,118.5,19],[172,119,19],[170.5,119.5,19.5],
            [169,120,20],[168,120.5,20.5],[167,121,21],[165.5,121.5,21.5],[164,122,22],
            [162.5,123,22.5],[161,124,23],[160,124.5,24],[159,125,25],[157.5,125.5,25.5],
            [156,126,26],[154.5,126.5,27],[153,127,28],[152,127.5,28.5],[151,128,29],
            [149.5,128.5,30],[148,129,31],[146.5,129,32],[145,129,33],[144,129.5,34],
            [143,130,35],[141.5,130.5,36],[140,131,37],[138.5,131.5,38],[137,132,39],
            [135.5,132.5,40],[134,133,41],[133,133.5,42.5],[132,134,44],[130.5,134,45],
            [129,134,46],[127.5,134.5,47],[126,135,48],[125,135.5,49],[124,136,50],
            [122.5,136,51.5],[121,136,53],[119.5,136.5,54],[118,137,55],[117,137,56.5],
            [116,137,58],[114.5,137.5,59],[113,138,60],[111.5,138,61.5],[110,138,63],
            [109,138.5,64],[108,139,65],[106.5,139,66.5],[105,139,68],[103.5,139.5,69.5],
            [102,140,71],[101,140,72],[100,140,73],[98.5,140.5,74.5],[97,141,76],
            [95.5,141,77.5],[94,141,79],[93,141,80],[92,141,81],[90.5,141.5,82.5],
            [89,142,84],[88,142,85.5],[87,142,87],[85.5,142,88.5],[84,142,90],
            [82.5,142,91],[81,142,92],[80,142,93.5],[79,142,95],[77.5,142.5,96.5],
            [76,143,98],[75,143,99.5],[74,143,101],[72.5,143,102.5],[71,143,104],
            [70,143,105],[69,143,106],[67.5,143,107.5],[66,143,109],[65,143,110.5],
            [64,143,112],[63,143,113.5],[62,143,115],[61,143,116],[60,143,117],
            [58.5,143,118.5],[57,143,120],[56,143,121.5],[55,143,123],[54,143,124.5],
            [53,143,126],[52.5,143,127],[52,143,128],[51,143,129.5],[50,143,131],
            [49.5,143,132.5],[49,143,134],[48,143,135],[47,143,136],[46.5,143,137.5],
            [46,143,139],[46,142.5,140],[46,142,141],[45.5,142,142.5],[45,142,144],
            [45,142,145],[45,142,146],[45,142,147.5],[45,142,149],[45.5,141.5,150],
            [46,141,151],[46.5,141,152.5],[47,141,154],[47.5,141,155],[48,141,156],
            [49,140.5,157],[50,140,158],[50.5,140,159],[51,140,160],[52,139.5,161],
            [53,139,162],[54.5,139,163.5],[56,139,165],[57,138.5,165.5],[58,138,166],
            [59.5,138,167],[61,138,168],[62.5,137.5,169],[64,137,170],[65.5,137,171],
            [67,137,172],[68.5,136.5,173],[70,136,174],[71.5,135.5,174.5],[73,135,175],
            [75,135,176],[77,135,177],[78.5,134.5,177.5],[80,134,178],[82,133.5,179],
            [84,133,180],[85.5,132.5,180.5],[87,132,181],[89,132,181.5],[91,132,182],
            [92.5,131.5,182.5],[94,131,183],[96,130.5,183.5],[98,130,184],[100,129.5,184.5],
            [102,129,185],[104,128.5,185.5],[106,128,186],[107.5,127.5,186.5],[109,127,187],
            [111,126.5,187.5],[113,126,188],[115,125.5,188],[117,125,188],[119,124,188.5],
            [121,123,189],[123,122.5,189],[125,122,189],[127,121.5,189],[129,121,189],
            [130.5,120.5,189.5],[132,120,190],[134,119,190],[136,118,190],[138,117.5,190],
            [140,117,190],[142,116.5,190],[144,116,190],[145.5,115,189.5],[147,114,189],
            [149,113.5,189],[151,113,189],[153,112,189],[155,111,189],[156.5,110,188.5],
            [158,109,188],[160,108.5,188],[162,108,188],[163.5,107,187.5],[165,106,187],
            [167,105.5,186.5],[169,105,186],[170.5,104,185.5],[172,103,185],[174,102,184.5],
            [176,101,184],[177.5,100,183.5],[179,99,183],[180.5,98,182.5],[182,97,182],
            [184,96,181.5],[186,95,181],[187.5,94,180.5],[189,93,180],[190.5,92,179],
            [192,91,178],[193.5,90,177.5],[195,89,177],[196.5,88,176],[198,87,175],
            [199.5,86,174.5],[201,85,174],[202.5,84,173],[204,83,172],[205,82,171],
            [206,81,170],[207.5,80,169],[209,79,168],[210,78,167.5],[211,77,167],
            [212.5,76,166],[214,75,165],[215,73.5,164],[216,72,163],[217.5,71,162],
            [219,70,161],[220,69,159.5],[221,68,158],[222,67,157],[223,66,156],
            [224,64.5,155],[225,63,154],[226,62,153],[227,61,152],[228,60,150.5],
            [229,59,149],[230,58,148],[231,57,147],[232,56,146],[233,55,145],
            [233.5,54,143.5],[234,53,142],[235,51.5,141],[236,50,140],[236.5,49,138.5],
            [237,48,137],[237.5,47.5,136],[238,47,135],[239,46,133.5],[240,45,132],
            [240.5,44,131],[241,43,130],[241.5,42.5,128.5],[242,42,127],[242.5,41,125.5],
            [243,40,124],[243,39.5,123],[243,39,122],[243.5,38.5,120.5],[244,38,119],
            [244.5,37.5,118],[245,37,117],[245,37,115.5],[245,37,114],[245.5,37,112.5]
        ];
        const idx = Math.round(((deg % 360) + 360) % 360);
        return colorsList[Math.min(idx, 359)];
    }

    MMChunkingPlugin.info = info;

    return MMChunkingPlugin;
})(jsPsychModule);
