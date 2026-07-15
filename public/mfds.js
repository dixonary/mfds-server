import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';

// Global variables

let $ = (x) => document.querySelector(x);
let $$ = (x) => Array.from(document.querySelectorAll(x));

let unconfirmedCallSign = null;
let callSign = null;
let activeCallSigns = null;
let manualCallSign = false;

let dictOrd = [];
let dict = {};


//**************************************************//
// SOUNDS

const snd_click = new Audio("sounds/click_ping.wav");
const snd_recv = new Audio("sounds/zap_down_quick.wav");
const snd_send = new Audio("sounds/zap_digi_up.wav");
// Only play receiving sounds after a certain time to avoid the history
// causing a big load to arrive at once
let receive_sounds_after = new Date();

let muted = false;

const play = (snd) => {
  if (muted) return;
  snd.play();
}

const toggleMute = () => {
  setMute(!muted);
}

const setMute = (m) => {
  muted = m;

  const muteIcon = $("#mute .fa");

  if (!muteIcon) {
    console.error("Can't find mute icon");
    return;
  }

  if (muted) {
    muteIcon.classList.remove("fa-volume-up")
    muteIcon.classList.add("fa-volume-off");
  }
  else {
    muteIcon.classList.remove("fa-volume-off");
    muteIcon.classList.add("fa-volume-up");
  }

  // To prove the point, this should only actually make a sound on *unmute*
  play(snd_click);

  localStorage.setItem("mute", m);
}

const initialiseMute = () => {
  wasMuted = localStorage.getItem("mute");
  if (wasMuted === true) {
    setMute(true);
  }
}

//**************************************************//
// THEME

let theme = 0;

const themeColors = ["#66aa00", "#b6a8e5", "#c49b9b", "#b1d6e9", "#ccc", "#fffb00", "#4f4f85", "#ff9538"];

const changeTheme = () => {
  let newTheme;
  if (theme == themeColors.length - 1)
    newTheme = 0;
  else
    newTheme = theme + 1;

  setTheme(newTheme);
}

const setTheme = (t) => {
  console.log(`New theme is theme ${t}`);
  theme = t;
  const root = $(":root");
  root.style.setProperty("--theme-color", themeColors[theme]);
  localStorage.setItem("theme", theme);
}

const initialiseTheme = () => {
  const ot = localStorage.getItem("theme");
  const oldTheme = parseInt(ot);
  if (oldTheme >= 0) {
    console.log("THEME", ot, oldTheme);
    setTheme(oldTheme);
  }
}

//**************************************************//
// DICTIONARY

const updateDict = () => {
  const dictView = $(".dict-view-content");
  dictView.innerHTML = "";

  dictView.innerHTML = `
    <table>
    <tbody>
    ${dictOrd.map(({ key, value }) => {
    return `<tr><td> ${key}</td><td>${value} </td>`;
  }).join("")}
    </tbody>
    </table>
  `;

  // Update stored dict
  localStorage.setItem("dict", JSON.stringify(dictOrd));

  // Update map version
  dict = Object.fromEntries(
    dictOrd.map(({ key, ...value }) => [key, value])
  );

  // Enable sending messages
  $(".entry").removeAttribute("data-disabled");

  $("#dictionary-click-zone p").innerHTML = "DICTIONARY LOADED<br>CLICK HERE TO CHANGE";
  $("#dictionary-click-zone").setAttribute("loaded", "true");

  // Reset all translations
  $$(".do-translate").map(el => el.removeAttribute("data-status"));
}

const loadDictionary = (text) => {
  try {
    const data = JSON.parse(text);
    dictOrd = data.wordDict.keys.map((x, i) => {
      return {
        key: x,
        value: data.wordDict.values[i]
      };
    });
    let descs = Object.fromEntries(data.descDict.keys.map((x, i) =>
      [x, data.descDict.values[i]]
    ));
    dictOrd = dictOrd.map(x => ({ ...x, desc: descs[x.key] }));

    updateDict();
  }

  catch (e) {
    console.error("Could not read dictionary");

    renderErrorMessage("Could not read dictionary: " + e.message);
  }

}

const initialiseDict = () => {
  let dict = localStorage.getItem("dict");
  if (!dict) {
    return;
  }
  else {
    console.log("Loading dictionary from storage")
    dictOrd = JSON.parse(dict);
    updateDict();
  }
}

//**************************************************//
// CALL SIGN

const getDigitValue = (elem) => {
  return parseInt(elem.getAttribute("data-value"));
}
const setDigitValue = (elem, v) => {
  elem.setAttribute("data-value", v);
  elem.querySelector(".value").innerText = v;

  updateLocalCallSign();
}

const getColor = (value) => {
  const hue = (137.5 * value) % 360;
  return `hsl(${hue}deg 100% 70%)`;
}

const updateLocalCallSign = () => {
  const elems = $$(".digit .value");
  const value = elems.map(x => parseInt(x.innerText)).reduce((acc, val) => acc * 8 + val);
  unconfirmedCallSign = value;

  const col = getColor(value);
  elems.forEach(x => { x.style.color = col; });

  let confirmBtn = $("#set-call-sign");
  confirmBtn.disabled = unconfirmedCallSign === callSign;
}

const setCallSign = (cs) => {
  // This value is not confirmed until receiving a K message
  unconfirmedCallSign = cs;
  const elems = $$(".digit");
  while (elems.length > 0) {
    let v = cs % 8;
    cs = cs >> 3;

    let elem = elems.pop();
    setDigitValue(elem, v);
  }
}

const randomizeCallSign = () => {
  const n = Math.floor(Math.random() * 8 ** 4);
  setCallSign(n);
}

const setActiveCallSigns = (n) => {
  activeCallSigns = n;
  $(".num-call-signs").innerText = `${n} CALL SIGN${n == 1 ? '' : 'S'} ACTIVE`;
}

const renderCallSign = (n) => {
  return n.toString(8).padStart(4, '0');
}

const initialiseCallSign = () => {
  let cs = localStorage.getItem("call-sign");
  if (cs === null) {
    randomizeCallSign();
  }
  else {
    console.log("Loaded call sign: " + cs);
    setCallSign(cs);
  }
}

//**************************************************//
// TRANSLATION

const doTranslation = () => {
  const elems = $$(".do-translate");
  elems.forEach((el) => {
    const st = el.getAttribute("data-status");
    if (st == "done") {
      return;
    }

    console.log("Found new element")

    const original = el.getAttribute("data-original");

    const str = JSON.parse(original);

    let newText = str
      .map((x, i) => {
        if (x < 0) {
          let entry = dict[x];
          if (entry) {
            let p = "";
            if (i > 0) {
              const prev = dict[str[i - 1]];
              const wasUndef = (str[i - 1] < 0 && !prev);
              if (entry.desc.formatMode > 0 || prev?.desc.formatModeAfter > 0 || wasUndef) {
                p = `<span class="spacer"> </span>`;
              }
            }
            const s = `<span class="signal" title="SIGNAL ${x}">${entry.value}</span>`;
            return `${p}${s}`;
          }
          else {
            // UNDEF is always rendered with a space
            let p = "";
            if (i > 0) {
              p = `<span class="spacer"> </span>`;
            }
            return `${p}<span class="signal undef">@${x}_UNDEF</span>`;
          }
        }
        else {
          const prev = dict[str[i - 1]];
          const wasUndef = (str[i - 1] < 0 && !prev);
          let p = "";
          if (prev?.desc.formatModeAfter > 0 || wasUndef) {
            p = `<span class="spacer"> </span>`;
          }
          return `${p}<span class="signal number">${x}</span>`;
        }
      })
      .join("");

    // newText = decodeEntities(newText);
    console.log(newText);

    el.innerHTML = newText;
    const rawText = el.textContent;

    new Typewriter(el, {
      delay: 1,
      loop: false,
    })
      .typeString(rawText)
      .callFunction(({ elements: { cursor, wrapper } }) => {
        cursor.remove();
        wrapper.replaceWith(...wrapper.childNodes);
        el.innerHTML = newText;

        // Scroll to bottom (again)
        $(".view").scrollTop = $(".view").scrollHeight;

      })
      .start();

    el.setAttribute("data-status", "done");
    return el;
  })
}

const renderMessage = (sender, message) => {

  const stringMessage = JSON.stringify(message);

  const el = document.createElement("div");
  el.classList.add("message");

  const ael = document.createElement("span");
  ael.classList.add("sender", "call-sign");
  ael.innerText = renderCallSign(sender);
  ael.style.color = getColor(sender);

  const bel = document.createElement("span");
  bel.classList.add("message-body", "do-translate");
  bel.setAttribute("data-original", stringMessage);

  el.appendChild(ael);
  el.appendChild(bel);

  // IMAGE RENDERING
  const sphereData = parseSphereData(message)
  if (sphereData) {
    const cel = document.createElement("button");
    cel.classList.add("imageButton");
    el.appendChild(cel);

    let sceneDiv = null;

    // Listener for clicking image button
    cel.addEventListener("click", () => {
      console.log("clicked")
      // Remove scene if exists
      if (sceneDiv) {
        sceneDiv.remove();
        sceneDiv = null;
        return;
      }

      // Else create the scene
      sceneDiv = document.createElement("div");
      sceneDiv.classList.add("imageScene");
      sceneDiv.style.width = "400px";
      sceneDiv.style.height = "300px";
      el.appendChild(sceneDiv);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, 400/300, 0.1, 2000);
      camera.position.x = -18.5;
      const light = new THREE.DirectionalLight(0xffffff, 10000);
      camera.add(light);

      const renderer = new THREE.WebGLRenderer();
      renderer.setSize(400, 300);
      sceneDiv.appendChild(renderer.domElement);
      const composer = new EffectComposer( renderer );
      const renderPixelatedPass = new RenderPixelatedPass(4, scene, camera);
      composer.addPass( renderPixelatedPass );

      const light2 = new THREE.AmbientLight(0xffffff,2);
      scene.add(light2);

      const bottomGrid = new THREE.GridHelper(30, 4, 0x13831F, 0x246E1A);
      bottomGrid.position.y = -8;
      bottomGrid.color
      const topGrid = new THREE.GridHelper(30, 4, 0x13831F, 0x246E1A);
      topGrid.position.y = 8;
      scene.add(bottomGrid);
      scene.add(topGrid);

      sphereData.forEach(([x,y,z,radius,color]) => {
        const sphere = new THREE.SphereGeometry(radius/2);
        // map the color - using the key levels apples described to match the game and interpolatee between
        let c = calculateColor(color);
        const mat = new THREE.MeshStandardMaterial();
        mat.color=c;
        const mesh = new THREE.Mesh(sphere, mat);
        mesh.position.set(x, z, y); // Alien coords!
        scene.add(mesh);
      })

      const controls = new OrbitControls(camera, renderer.domElement);
        
      function animate(time) {
        controls.update();
        composer.render(scene, camera);
      }
      renderer.setAnimationLoop(animate);

    })
  }

  $("#all-messages").appendChild(el);

  // Scroll to bottom
  $(".view").scrollTop = $(".view").scrollHeight;

}

const renderErrorMessage = (message) => {

  const el = document.createElement("div");
  el.classList.add("message", "error");

  const ael = document.createElement("i");
  ael.classList.add("fa", "fa-warning");

  const bel = document.createElement("span");
  bel.innerText = message;

  el.appendChild(ael);
  el.appendChild(bel);
  $("#all-messages").appendChild(el);

  // Scroll to bottom
  $(".view").scrollTop = $(".view").scrollHeight;

}

//**************************************************//
// PARSING

const parseText = (text) => {
  // Text parsing. Tricky.

  // Idea: At each parse point (initially 0), take the longest substring matching any word in the dictionary.
  // If there is none, add the position to an invalid set and move the parse point on 1 to go again.
  // If there is one, move to the end of that longest match and go again.

  // The problem is that this will fail when one thing is a prefix of
  // another, e.g. it will not be able to read "ABC" as "A BC" if there
  // is also a word "AB"

  // But I don't know what the game does in these cases either!
  // So it's good enough for now

  text = text.toUpperCase();

  const signals = [];
  const invalid = [];

  // Put "invalid" into contiguous blocks of characters.
  const addInvalid = (n) => {
    if (invalid.length === 0) {
      invalid.push([n]);
      return;
    }
    // Invariant: "lastArr" is nonempty
    let lastArr = invalid[invalid.length - 1];
    let last = lastArr[lastArr.length - 1];
    console.log(lastArr, last, n);
    if (n === last + 1) {
      lastArr.push(n);
    }
    else {
      invalid.push([n]);
    }
  }

  let ix = 0;
  while (ix < text.length) {
    if (text[ix] === " ") {
      ix++;
      continue;
    }

    // Raw signal in the form |-100 or |5
    if (text[ix] === "|") {
      const numStr = text.slice(ix + 1).match(/^-?\d+/)?.[0];
      if (numStr) {
        const num = parseInt(numStr, 10);
        signals.push(num);
        ix += numStr.length + 1;
        continue;
      }
    }

    // Try matching a nonnegative integer
    // ... in base 10 :(
    const numStr = text.slice(ix).match(/^\d+/)?.[0];
    if (numStr) {
      const num = parseInt(numStr, 10);
      signals.push(num);
      ix += numStr.length;
      continue;
    }

    // Otherwise match signals

    const matches = [];
    Object.entries(dict).forEach(([signal, word]) => {
      if (text.startsWith(word.value, ix)) {
        matches.push({ signal, value: word.value });
      }
    });

    if (matches.length === 0) {
      addInvalid(ix);
      ix++;
      continue;
    }

    matches.sort((a, b) => a.value.length - b.value.length);

    // There cannot be two matches of the same length as they would
    // be the same word.
    let longestMatch = matches[matches.length - 1];
    // Signals are stored as strings in the dict because object
    // keys are always strings
    signals.push(parseInt(longestMatch.signal, 10));
    ix += longestMatch.value.length;
    continue;
  }

  // Must be no invalid signals
  if (invalid.length === 0) {
    // Max length 
    const maxSignals = 1500;
    if (signals.length <= 1700) {
      return signals;
    }
    else {
      renderErrorMessage(`Message too long; maximum number of signals is ${maxSignals} (you have ${signals.length})`);
    }
  }
  else {
    let invalidStr = invalid.map(chars => {
      let str = chars.map(ix => text[ix]).join("");
      return `Unknown token ${str} at position ${chars[0]}`;
    }).join("; ");
    renderErrorMessage(invalidStr);
    return null;
  }
}

//**************************************************//
// RENDERING IMAGES

// Returns the spheredata in a nicer format for rendering
const parseSphereData = (message) => {
  // CHECK IF RENDER IN DICTIONARY
  if (!dict[-53]) {
    return false;
  }
  try {
    if (!message.includes(-53)) { // If no image signal, doesn't contain an image
    return false;
    }
    if (message.filter(x => x == -53).length > 1) { // If multiple image signals, invalid
      return false;
    }

    // Get position of -53 signal
    const imagePos = message.indexOf(-53);
    if (message[imagePos+1] != -14 ) {
      return false;
    }

    // Using a stack, find the final parenthesis
    // Edit - this is uneccessary lol - forgot theres no inner parentheses, just find next -15. keep cause no reason not to
    let parens = 1;
    let finalIndex = -1;
    for (let i = imagePos+2; i < message.length; i++) {
      if (message[i] == -14) {
        parens += 1;
      } else if (message[i] == -15) {
        parens -= 1;
      }
      if (parens == 0) {
        finalIndex = i;
        break;
      }
    }
    if (finalIndex == -1) { // Mismatched brackets around image
      return false;
    }

    // Now we have the start and end of the "image", so we can check everything in between matches the pattern!
    let check = true;
    let current = imagePos+2;
    let allSpheres = [];
    while (check) {
      let currentSphere = [];
      // If not followed by "sphere" then fail
      if (message[current++] != -52 ) { 
        return false;
      }
      // Check for 5 positive numbers that make a sphere
      for (let i = 0; i < 4; i++) {
        let negated = false;
        let decimal = false;
        let currentNumber;
        let firstHalf = 0;
        let secondHalf = 0;
        if (message[current] == -1) { // Consumes negation if present for first 3
          current++;
          negated = true;
        }
        firstHalf = message[current];
        // Check positive
        if (message[current++] < 0 ) {
          return false;
        }
        // Check for decimal
        if (message[current] == -10) { // Consumes decimal point
          current++;
          decimal = true;

          secondHalf = message[current];
          // Check next is positive as it is the next number after a decimal
          if (message[current++] < 0 ) {
            return false;
          }
        }

        // Treat negation and decimals
        if (decimal) {
          currentNumber = parseFloat(`${firstHalf}.${secondHalf}`);
          console.log("floatparsed " + currentNumber);
        } else {
          currentNumber = firstHalf;
        }
        // Put number into the currentSphere array
        if (negated) {
          currentSphere.push(-currentNumber);
        } else {
          currentSphere.push(currentNumber);
        }
        
        if (message[current++] != -3) {
          return false;
        }
      }
      // Check final pos number and bracket, also enforce less than 64
      if (message[current] < 0 || message[current] > 64  ) {
        return false;
      }
      currentSphere.push(message[current]);
      current++;
      allSpheres.push(currentSphere);
      if (message[current] === -3) {
        current++;
        check = true;
      } else {
        // If not a closing brace, failure
        if (message[current] != -15) {
          return false;
        }
        check = false;
      }
    }

    console.log("ALLSPHERES")
    console.log(allSpheres)
    return allSpheres; // Returns a nice 2d array of 5-number sphere data

  } catch (error) {
    return false;
  }
}

// Helper method for calculating the sphere colors
// Visual Object colors are evaluated on a gradient [0, 64] to get RGB values. The full gradient linearly blends between keys. In the game, the keys are: 
// 0 - #FF5800 0-7
// 1 - #BBFF00 7-14
// 2 - #00CDFF 14-21
// 3 - #0084FF 21-28
// 4 - #4D00FF
// 5 - #FB39FF
// 6 - #FF0FD7
// 7 - #484848
// 8 - #636363
// 9 - #FFFFFF
// Theres still something fishy. 30 should be pink but its blue.
const calculateColor = (value) => {
  let c;
  let percentage;
  const spacing = 64/9;

  if (value <= spacing) { // Linearly blend between the first two
    percentage = (value/9);
    c = getGradientColor("FF5800", "BBFF00", percentage);
  } else if (value <= spacing*2) {
    percentage = ((value-spacing)/spacing);
    c = getGradientColor("BBFF00", "00CDFF", percentage);
  } else if (value <= spacing*3) {
    percentage = ((value-spacing*2)/spacing);
    c = getGradientColor("00CDFF", "0084FF", percentage);
  } else if (value <= spacing*4) {
    percentage = ((value-spacing*3)/spacing);
    c = getGradientColor("0084FF", "4D00FF", percentage);
  } else if (value <= spacing*5) {
    percentage = ((value-spacing*4)/spacing);
    c = getGradientColor("4D00FF", "FB39FF", percentage);
  } else if (value <= spacing*6) {
    percentage = ((value-spacing*5)/spacing);
    c = getGradientColor("FB39FF", "FF0FD7", percentage);
  } else if (value <= spacing*7) {
    percentage = ((value-spacing*6)/spacing);
    c = getGradientColor("FF0FD7", "484848", percentage);
  } else if (value <= spacing*8) {
    percentage = ((value-spacing*7)/spacing);
    c = getGradientColor("484848", "636363", percentage);
  } else {
    percentage = ((value-spacing*8)/spacing);
    c = getGradientColor("636363", "FFFFFF", percentage);
  }

  console.log("COLOUR " + c);
  return new THREE.Color(Number(c));
}

// Source - https://stackoverflow.com/a/27709336
// Posted by rjurado01, modified by community. See post 'Timeline' for change history
// Retrieved 2026-07-15, License - CC BY-SA 4.0
const getGradientColor = function(start_color, end_color, percent) {

  // get colors
  let start_red = parseInt(start_color.substr(0, 2), 16),
    start_green = parseInt(start_color.substr(2, 2), 16),
    start_blue = parseInt(start_color.substr(4, 2), 16);

  let end_red = parseInt(end_color.substr(0, 2), 16),
    end_green = parseInt(end_color.substr(2, 2), 16),
    end_blue = parseInt(end_color.substr(4, 2), 16);

  // calculate new color
  let diff_red = end_red - start_red;
  let diff_green = end_green - start_green;
  let diff_blue = end_blue - start_blue;

  diff_red = ((diff_red * percent) + start_red).toString(16).split('.')[0];
  diff_green = ((diff_green * percent) + start_green).toString(16).split('.')[0];
  diff_blue = ((diff_blue * percent) + start_blue).toString(16).split('.')[0];

  // ensure 2 digits by color
  if (diff_red.length == 1) diff_red = '0' + diff_red
  if (diff_green.length == 1) diff_green = '0' + diff_green
  if (diff_blue.length == 1) diff_blue = '0' + diff_blue

  console.log("red diff " + diff_red)
  console.log("blue diff " + diff_blue)
  console.log("green diff " + diff_green)

  return "0x" + diff_red + diff_green + diff_blue;
};


//**************************************************//
// SETUP

let socket;

window.onload = () => {
  console.log("Opening websocket connection...")

  socket = new WebSocket(`wss://dscr-relay.dixonary.co.uk`);
  socket.addEventListener("open", () => {
    console.log("connected");
    socket.send(`S,${unconfirmedCallSign}`);

    // Prevent message-received sounds for the first 5 seconds
    receive_sounds_after = Date.now() + 5;
  })

  socket.addEventListener("message", (ev) => {
    let content = ev.data.split(",");
    console.log("RECEIVED: " + content);

    const msgType = content[0];
    switch (msgType) {
      case 'K':
        // Call sign OK
        const newCallSign = parseInt(content[1]);
        let oldCallSign = callSign;
        console.log(`New call sign is ${newCallSign}`);
        callSign = newCallSign;
        setCallSign(newCallSign);
        localStorage.setItem("call-sign", newCallSign);

        manualCallSign = false;

        if (oldCallSign)
          [0, 5].forEach((n) => {
            const btn = $("#set-call-sign");
            btn.innerText = "   CHANGED   ";
            setTimeout(() => {
              if (n % 2 == 0) {
                btn.setAttribute("flash", "true");
              }
              else {
                btn.removeAttribute("flash");
              }
              if (n == 5) {
                btn.innerText = "SET CALL SIGN"
              }
            }, n * 200);

          });

        break;
      case 'U':
        // Call sign in use

        if (manualCallSign) {
          renderErrorMessage(`Call sign ${renderCallSign(unconfirmedCallSign)} in use`);
        }
        else {
          renderErrorMessage(`Call sign ${renderCallSign(unconfirmedCallSign)} in use; randomizing...`);
          randomizeCallSign();
          socket.send(`S,${unconfirmedCallSign}`);
        }
        break;
      case 'C':
        // List of active call signs
        setActiveCallSigns(content.length - 1);
        console.log(`There are now ${activeCallSigns} active call signs`);
        break;
      case 'R':
        // Received message
        const sender = parseInt(content[1]);
        const message = content.slice(2).map(x => parseInt(x, 10));

        renderMessage(sender, message);

        if (sender !== callSign && Date.now() > receive_sounds_after) {
          play(snd_recv);
        }

        break;
    }
  });

  $$(".digit-up").forEach(elem => {
    elem.addEventListener("click", () => {
      const val = getDigitValue(elem.parentNode);
      let newVal;
      if (val === 7) newVal = 0;
      else newVal = val + 1;
      setDigitValue(elem.parentNode, newVal);
      play(snd_click);
    })
  });

  $$(".digit-dn").forEach(elem => {
    elem.addEventListener("click", () => {
      const val = getDigitValue(elem.parentNode);
      let newVal;
      if (val === 0) newVal = 7;
      else newVal = val - 1;
      setDigitValue(elem.parentNode, newVal);
      play(snd_click);
    })
  });

  $("#set-call-sign").addEventListener("click", () => {
    manualCallSign = true;
    socket.send(`S,${unconfirmedCallSign}`);
  })


  const consumeDictionary = (file) => {
    console.log("Consuming dictionary")
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      loadDictionary(reader.result);
    });
    reader.readAsText(file);
  }

  $("#dictionary-input").addEventListener("change", (ev) => {
    const file = ev.target.files[0];
    consumeDictionary(file);
  });
  const dropZone = $("#dictionary-drop-zone");
  const dropHandler = (ev) => {
    const files = [...ev.dataTransfer.items];
    if (files.length === 0) {
      console.warn("No files");
      return;
    }
    consumeDictionary(files[0].getAsFile());
  }
  window.addEventListener("dragover", (e) => {
    e.preventDefault();
  });
  window.addEventListener("drop", (e) => {
    e.preventDefault();
  });

  window.addEventListener("drop", dropHandler);
  window.addEventListener("dragover", (e) => {
    const fileItems = [...e.dataTransfer.items].filter(
      (item) => item.kind === "file",
    );
    if (fileItems.length > 0) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  });

  initialiseCallSign();
  initialiseDict();

  // Auto-translate anything with the "do-translate" class
  window.setInterval(() => {
    doTranslation();
  }, 100);

  // Move focus back to the input box when typing
  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey)
      return;


    const target = event.target;

    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      target?.isContentEditable
    ) {
      return;
    }

    $("#message-input").focus({ preventScroll: true });
  });

  const doSendMessage = () => {
    const text = $("#message-input").value;
    if (text.length === 0) {
      console.warn("No message to send");
      return;
    }
    if (!dict) {
      console.warn("No dictionary; cannot send");
      return;
    }
    if (text.length > 0) {
      let result = parseText(text);
      console.log(result);
      if (result) {
        const msg = `M,${result.join(",")}`
        console.log("Sending: " + msg);
        socket.send(msg);
        // Clear message
        $("#message-input").value = "";
        // Play sound
        play(snd_send);
      }
    }
  }

  // Try to parse the input box
  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey)
      return;

    if (event.key === "Enter") {
      doSendMessage();
    }
  });

  // Go into read-only mode
  const params = new URLSearchParams(window.location.search);
  if (params.has("read-only")) {
    $("main").classList.add("read-only");
  }

  // Setup muting/unmuting
  initialiseMute();
  $("#mute").addEventListener("click", () => {
    toggleMute();
  });

  // Setup theme and changing theme
  initialiseTheme();
  $("#retheme").addEventListener("click", () => {
    changeTheme();
  });

}