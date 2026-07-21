import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RenderPixelatedPass } from 'three/addons/postprocessing/RenderPixelatedPass.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';

// Global constants

let relayEndpoint = `wss://dscr-relay.dixonary.co.uk`;

// When running locally, use the local server
if (window.location.hostname === "localhost") {
  relayEndpoint = `ws://localhost:3101`;
}

// Scroll down only if at most 100px above the bottom
const scrollDownThreshold = 100;

// Distinguished Signals
const SIGNAL_ENC = -65535;
const SIGNAL_ENC_ENABLE = -65534;
const SIGNAL_ENC_DISABLE = -65533;
const SIGNAL_ENC_SKELETON = -65536;


// Global variables

let $ = (x) => document.querySelector(x);
let $$ = (x) => Array.from(document.querySelectorAll(x));

let unconfirmedCallSign = null;
let callSign = null;
let activeCallSigns = null;
let manualCallSign = false;

let dictOrd = [];
let dict = {};
let lastLoadedDict = "";

let typewriters = [];
let retrying = false;

// Will be used for the socket send function
let send = (msg) => {
  console.warn("Could not send message (socket is not open)");
}

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
  const wasMuted = localStorage.getItem("mute");
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
// EXPANDED FORMAT

// Whether to put newlines when rendering messages, if the dictionary says to.
// We default to rendering things inline, but some people like the newlines.
let useExpandedFormat = false;

const toggleExpandedFormat = () => {
  setExpandedFormat(!useExpandedFormat);
}

const setExpandedFormat = (t) => {
  console.log(`New expanded format is ${t}`);
  useExpandedFormat = t;

  if (t) {
    $("#toggle-expanded-format i").classList.remove("fa-compress");
    $("#toggle-expanded-format i").classList.add("fa-expand");
  }
  else {
    $("#toggle-expanded-format i").classList.remove("fa-expand");
    $("#toggle-expanded-format i").classList.add("fa-compress");
  }

  localStorage.setItem("use-expanded-format", JSON.stringify(useExpandedFormat));

  retranslateAll();
}

const initialiseExpandedFormat = () => {
  const oef = localStorage.getItem("use-expanded-format");
  const oldEF = JSON.parse(oef);
  if (oldEF) {
    console.log("EXPANDED FORMAT", oef, oldEF);
    setExpandedFormat(oldEF);
  }
}

//**************************************************//
// SIDEBAR

let sidebar_visible = false;

const toggleSidebar = () => {
  sidebar_visible = !sidebar_visible;
  updateSidebar();
}

const updateSidebar = () => {
  const main = $("main");

  if (sidebar_visible) {
    main.classList.remove("hide-sidebar");
  }
  else {
    main.classList.add("hide-sidebar");
  }

  localStorage.setItem("sidebar-visible", sidebar_visible);
}

const initialiseSidebar = () => {
  const os = JSON.parse(localStorage.getItem("sidebar-visible")) ?? true;
  sidebar_visible = !!os;
  console.log(`Sidebar initialised to ${sidebar_visible ? "visible" : "hidden"}`);
  updateSidebar();
}

//**************************************************//
// SENDER ICONS

let show_sender_icons = false;

const toggleSenderIcons = () => {
  show_sender_icons = !show_sender_icons;
  updateSenderIcons();
}

const updateSenderIcons = () => {
  const main = $("main");

  if (show_sender_icons) {
    main.classList.add("show-sender-icons");
  }
  else {
    main.classList.remove("show-sender-icons");
  }

  localStorage.setItem("show-sender-icons", show_sender_icons);
}

const initialiseSenderIcons = () => {
  const os = JSON.parse(localStorage.getItem("show-sender-icons"));
  show_sender_icons = !!os;
  console.log(`Sender icons initialised to ${show_sender_icons ? "visible" : "hidden"}`);
  updateSenderIcons();
}

const getSenderIcon = (value) => {
  const elem = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg"
  );
  elem.classList.add("call-sign-icon");

  // Default scale
  const ICON_SIZE = 100;

  elem.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  elem.setAttribute("viewBox", `0 0 ${ICON_SIZE} ${ICON_SIZE}`);

  const hue = getHue(value);
  let fgColor = `oklch(from hsl(${hue} 100% 50%) calc(l - 0.4) c h)`;
  let bgColor = `oklch(from hsl(${hue} 100% 50%) calc(l + 0.4) c h)`;

  // Swap fg and bg half the time
  if (value % 2 == 0) {
    const t = fgColor;
    fgColor = bgColor;
    bgColor = t;
  }

  // Get raw points corresponding to one 16th of the shape
  const drawShape = (style, subpos) => {
    const size = ICON_SIZE / 4;

    const left = (subpos % 2) * size;
    const top = Math.floor(subpos / 2) * size;
    const right = left + size;
    const bottom = top + size;

    const tl = [left, top];
    const tr = [right, top];
    const bl = [left, bottom];
    const br = [right, bottom];

    switch (style) {
      case 0: return [tl, tr, br, bl];
      case 1: return [];
      case 2: return [tl, br, bl];
      case 3: return [tr, bl, tl];
      case 4: return [tl, br, tr];
      case 5: return [tr, bl, br];
    }
  };

  const formats = [0, 1, 2, 3]
    .map(i => simpleHash("color" + ("" + value)[i]) % 6);

  const quarter = formats
    .map((format, i) => drawShape(format, i))
    .filter(points => points.length > 0);

  const transformPoint = ([x, y], tx, ty, rotation, flipX) => {
    const iq = ICON_SIZE / 4;

    x -= iq;
    y -= iq;
    x *= flipX;

    // Rotate around 0,0
    const angle = rotation * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const rotatedX = x * cos - y * sin;
    const rotatedY = x * sin + y * cos;

    // final translate
    return [
      rotatedX + tx + iq,
      rotatedY + ty + iq
    ];
  };

  const useArrangementA = (simpleHash("arrangement" + value) % 2 == 0);

  const polygons = [];

  for (let i = 0; i < 4; i++) {
    const iq = ICON_SIZE / 4;
    const tx = iq * ((i % 2) * 2);
    const ty = iq * (Math.floor(i / 2) * 2);

    let flipX;
    let rotation;

    if (useArrangementA) {
      rotation = [90, 0, 180, 270][i];
      flipX = -1;
    } else {
      flipX = i === 1 || i === 2 ? -1 : 1;
      rotation = i > 1 ? 180 : 0;
    }

    quarter.forEach((poly) => {
      polygons.push(
        poly.map(point =>
          transformPoint(point, tx, ty, rotation, flipX)
        )
      );
    });
  }

  const pathData = polygons
    .map(points => {
      const [[x, y], ...rest] = points;

      return [
        `M ${x} ${y}`,
        ...rest.map(([x, y]) => `L ${x} ${y}`),
        "Z",
      ].join(" ");
    })
    .join(" ");

  elem.innerHTML = `
  <rect
    x="0"
    y="0"
    width="${ICON_SIZE}"
    height="${ICON_SIZE}"
    fill="${bgColor}"
    stroke="none"
  />

  <g transform="translate(${ICON_SIZE * 0.1} ${ICON_SIZE * 0.1}) scale(0.8)">
    <path
      d="${pathData}"
      fill="${fgColor}"
      stroke="none"
    />
  </g>
`;

  return elem.outerHTML;
}


//**************************************************//
// DICTIONARY

const updateDict = () => {
  const dictView = $(".dict-view-content");
  dictView.innerHTML = "";

  const rows = dictOrd.map(({ key, value }) => {
    return `<tr><td> ${key}</td><td>${value} </td>`;
  }).join("");

  dictView.innerHTML = `<table><tbody>${rows}</tbody></table>`;

  // Update stored dict
  localStorage.setItem("dict", JSON.stringify(dictOrd));
  localStorage.setItem("dict-raw", lastLoadedDict);

  // Update map version
  dict = Object.fromEntries(
    dictOrd.map(({ key, ...value }) => [key, value])
  );

  // Enable sending messages
  $(".entry").removeAttribute("data-disabled");

  $("#dictionary-click-zone p").innerHTML = "DICTIONARY LOADED<br>CLICK HERE TO CHANGE";
  $("#dictionary-click-zone").setAttribute("loaded", "true");

  // Reset all translations
  $$(".do-translate").forEach(el => el.removeAttribute("data-status"));
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

    // Set the most recently loaded dict contents
    lastLoadedDict = text;

    updateDict();
    return true;
  }

  catch (e) {
    console.error("Could not read dictionary");
    renderErrorMessage("Could not read dictionary: " + e.message);
    return false;
  }
}


const initialiseDict = () => {
  let dict = localStorage.getItem("dict");
  let dictRaw = localStorage.getItem("dict-raw");
  if (!dict) {
    return;
  }
  else {
    console.log("Loading dictionary from storage")
    dictOrd = JSON.parse(dict);
    lastLoadedDict = dictRaw;
    updateDict();
  }
}

//**************************************************//
// ENCRYPTED SIGNALS

/* 
  An encrypted signal is one that starts with SIGNAL_ENC, then an integer k (the 
  encryption key), then the main message body.
  Only users with encryption key k enabled will see messages using encryption
  key k.
 
  Users with encryption key 0 enabled will see all messages.
 
*/

let encryptionKeys = new Set([]);

const updateEncryptionKeys = () => {
  const n = encryptionKeys.size;
  const elKeys = $(".encryption-keys");
  const elNum = $(".encryption-keys .num-encryption-keys");
  const elAll = $("#all-encryption-keys");
  elNum.innerText = `${n} KEY${n == 1 ? "" : "S"} ENABLED`;
  elKeys.setAttribute("data-n", n);

  elAll.innerHTML = "";
  encryptionKeys.forEach(k => {
    let name = dict[k]?.value ?? "";
    if (name) name += " ";
    elAll.innerHTML += `<p class="encryption-key">${name}[${k}]</p>`;
  });

  const arr = Array.from(encryptionKeys)
  localStorage.setItem("encryption-keys", JSON.stringify(arr));
}

const enableEncryptionKey = (k) => {
  encryptionKeys.add(k);
  renderErrorMessage("Added encryption key " + k, ["good"])
  updateEncryptionKeys();
}

const disableEncryptionKey = (k) => {
  encryptionKeys.delete(k);
  renderErrorMessage("Removed encrpytion key " + k, ["good"])
  updateEncryptionKeys();
}

const initialiseEncryptionKeys = () => {
  let ks = JSON.parse(localStorage.getItem("encryption-keys"));
  if (ks) {
    console.log("Encryption keys loaded from storage")
    encryptionKeys = new Set(ks);
    updateEncryptionKeys();
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

const getHue = (value) => {
  return (137.5 * value) % 360;
}
const getColor = (value) => {
  return `hsl(${getHue(value)}deg 100% 70%)`;
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
  const numCallSigns = $(".num-call-signs");
  numCallSigns.innerHTML = getSenderIcon(12345);
  $(".num-call-signs").innerHTML += `${n} CALL SIGN${n == 1 ? '' : 'S'} ACTIVE`;
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

const getTranslation = (str, inline = false) => {

  const formatSpace = (formatMode) => {
    // Compress if not in expanded format mode
    if (formatMode > 1 && (!useExpandedFormat || inline)) formatMode = 1;

    if (formatMode == 1) {
      return `<span class="spacer"> </span>`;
    }
    else if (formatMode == 2) {
      return `<span class="line-break"><br></span>`;
    }
    else if (formatMode == 3) {
      return `<span class="line-break"><br></span><span class="line-break"><br></span>`;
    }
    else {
      return ``;
    }
  }

  // This is used to compute how big the gap is between the previous and 
  // current signal. It should usually be the greater of the two.
  let lastGap = 0;

  let newText = str
    .map((x, i) => {
      if (x < 0) {
        // Signals
        let entry = dict[x];
        if (entry) {
          let p = "";
          let a = "";
          if (i > 0) {
            const prev = dict[str[i - 1]];

            let formatMode = Math.max(lastGap, entry?.desc?.formatMode);
            if (i == 0) formatMode = 0;

            p = formatSpace(formatMode);

            if (str[i - 1] === x && entry?.desc?.breakOnDouble && lastGap < 2) {
              lastGap = 2;
            }
            else {
              lastGap = entry?.desc?.formatModeAfter ?? 0;
            }
          }

          const s = `<span class="signal" title="SIGNAL ${x}">${entry.value}</span>`;
          return `${p}${s}`;
        }
        else {
          // UNDEF is always rendered with a space (for now)
          let formatMode = Math.max(lastGap, 1);
          if (i == 0) formatMode = 0;

          let p = formatSpace(formatMode);

          lastGap = 1;

          return `${p}<span class="signal undef">@${x}_UNDEF</span>`;
        }
      }
      else {
        // Numbers
        const prev = dict[str[i - 1]];
        const wasUndef = (str[i - 1] < 0 && !prev);
        let p = "";

        // Apply no spacing requirements for numbers
        let formatMode = lastGap;
        lastGap = 0;

        p = formatSpace(formatMode);

        return `${p}<span class="signal number">${x}</span>`;
      }
    })
    .join("");

  return newText;
}

const addTypewriter = (el, fullText, fullHTML) => {

  let n = typewriters.length;

  let t =
    new Typewriter(el, {
      delay: 1,
      loop: false,
    })
      .typeString(fullText)
      .callFunction(({ elements: { cursor, wrapper } }) => {
        cursor.remove();
        wrapper.replaceWith(...wrapper.childNodes);
        el.innerHTML = fullHTML;
        typewriters[n] = null;

        scrollToBottom();

      })
      .start();

  typewriters[n] = t;

  el.setAttribute("data-typewriter", n);
  return n;
}


// Forcibly translate all messages, without typewriting them
const retranslateAll = () => {
  const elems = $$(".do-translate");

  console.log(elems.length);

  elems.forEach((mel) => {
    // Remove the typewriter effect, if it is active
    const t = mel.getAttribute("data-typewriter");
    if (t !== undefined && t !== null && typewriters[t]) {
      typewriters[t].stop();
      typewriters[t] = null;
    }

    let str = JSON.parse(mel.getAttribute("data-original"));

    if (!mel.parentNode.parentNode.hasAttribute("data-expanded")) {
      // Truncate
      if (str.length > 100) {
        str = str.slice(0, 100);
        str.push(-25);
      }
    }

    const newText = getTranslation(str, el.hasAttribute("data-inline"));
    mel.innerHTML = newText;
  });
}

const doTranslation = () => {
  const elems = $$(".do-translate");
  elems.forEach((el) => {
    const st = el.getAttribute("data-status");
    if (st == "done") {
      return;
    }

    console.log("Found new element")

    const original = el.getAttribute("data-original");
    let str = JSON.parse(original);

    // Truncate
    if (str.length > 100) {
      str = str.slice(0, 100);
      str.push(-25);
    }

    const newText = getTranslation(str, el.hasAttribute("data-inline"));

    el.innerHTML = newText;

    // Get a copy with explicit newlines
    const clone = el.cloneNode(true);
    clone.querySelectorAll("br").forEach(br => { br.replaceWith("\n"); });

    const rawText = clone.textContent;

    el.setAttribute("data-status", "done");

    addTypewriter(el, rawText, newText);

    return el;
  })
}

const toggleExpandMessage = (el) => {

  const mel = el.querySelector(".message-body.do-translate");

  // Remove the typewriter effect, if it is active
  const t = mel.getAttribute("data-typewriter");
  if (t !== undefined && t !== null && typewriters[t]) {
    typewriters[t].stop();
    typewriters[t] = null;
  }

  let str = JSON.parse(mel.getAttribute("data-original"));

  const exp = el.getAttribute("data-expanded");
  if (exp) {
    // Truncate
    el.removeAttribute("data-expanded");

    str = str.slice(0, 100);
    str.push(-25);
  }
  else {
    el.setAttribute("data-expanded", "true");
  }

  // Instantly set the HTML, and we're done
  const newText = getTranslation(str);
  mel.innerHTML = newText;

}

const renderMessage = (sender, sequence, message, encryptionKey) => {

  const stringMessage = JSON.stringify(message);

  const el = document.createElement("div");
  el.classList.add("message");

  const iconEl = document.createElement("div");
  iconEl.classList.add("sender-icon");

  iconEl.innerHTML = getSenderIcon(sender);
  el.appendChild(iconEl);

  const mel = document.createElement("div");
  mel.classList.add("message-body");

  const ael = document.createElement("span");
  ael.classList.add("sender", "call-sign");
  ael.innerText = renderCallSign(sender);
  ael.style.color = getColor(sender);

  const bel = document.createElement("span");
  bel.classList.add("message-body", "do-translate");
  bel.setAttribute("data-original", stringMessage);

  const sel = document.createElement("div");
  sel.classList.add("message-aux");
  const seqel = document.createElement("a");
  seqel.classList.add("message-sequence");
  seqel.innerText = ("" + sequence).padStart(3, "0");

  const vel = document.createElement("div");

  mel.appendChild(ael)

  // Add info about encrypted message  
  if (encryptionKey !== undefined) {
    const kel = document.createElement("span");
    kel.classList.add("encryption-key");

    let keyName = (dict[encryptionKey]?.value) ?? ("" + encryptionKey);

    kel.innerHTML = `<i class="fa fa-key"></i>${keyName}`;
    mel.appendChild(kel);
  }

  mel.appendChild(bel);
  el.appendChild(mel);

  el.appendChild(vel);

  sel.appendChild(seqel);

  if (message.length > 50) {
    const smel = document.createElement("button");
    smel.classList.add("seeMoreButton");
    smel.innerText = '...';

    smel.addEventListener("click", () => toggleExpandMessage(el));

    sel.appendChild(smel);
  }
  el.appendChild(sel);


  // IMAGE RENDERING
  const sphereData = parseSphereData(message)
  if (sphereData) {
    const cel = document.createElement("button");
    cel.classList.add("imageButton");
    sel.appendChild(cel);

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
      vel.appendChild(sceneDiv);

      scrollToBottom();

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, 400 / 300, 0.1, 2000);
      camera.position.x = -18.5;
      const renderer = new THREE.WebGLRenderer();
      renderer.logarithmicDepthBuffer = true;
      renderer.setSize(400, 300);
      sceneDiv.appendChild(renderer.domElement);
      const composer = new EffectComposer(renderer);
      const renderPixelatedPass = new RenderPixelatedPass(4, scene, camera);
      composer.addPass(renderPixelatedPass);

      const bottomGrid = new THREE.GridHelper(30, 4, 0x13831F, 0x246E1A);
      bottomGrid.position.y = -8;
      bottomGrid.color
      const topGrid = new THREE.GridHelper(30, 4, 0x13831F, 0x246E1A);
      topGrid.position.y = 8;
      scene.add(bottomGrid);
      scene.add(topGrid);

      sphereData.forEach(([x, y, z, radius, color]) => {
        const sphere = new THREE.SphereGeometry(radius / 2);
        // map the color - using the key levels apples described to match the game and interpolatee between
        let c = calculateColor(color);
        // https://medium.com/@aurelienagtn/introduction-to-shaders-with-three-js-create-an-animated-sphere-d4920fbab126
        // https://learnopengl.com/code_viewer_gh.php?code=src/2.lighting/2.2.basic_lighting_specular/2.2.basic_lighting.fs
        const mat = new THREE.ShaderMaterial({
          vertexShader: `
            varying vec3 Normal;
            varying vec3 camDir;
            
            void main() {
              Normal = normalize(normal);

              vec3 sphereCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
              camDir = normalize(cameraPosition - sphereCenter);

              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: `
            varying vec3 Normal;  
            varying vec3 camDir;
              
            uniform vec3 lightPos; 
            uniform vec3 lightColor;
            uniform vec3 objectColor;
            
            void main()
            {
                // diffuse 
                float diffuseStrength = 0.93;
                vec3 norm = normalize(Normal);
                vec3 lightDir = camDir;
                float diff = max(dot(norm, lightDir), 0.0);
                vec3 diffuse = diff * lightColor * diffuseStrength;

                // specular
                float specularStrength = 0.2;
                vec3 viewDir = camDir;
                vec3 reflectDir = reflect(-lightDir, norm);  
                float spec = pow(max(dot(viewDir, reflectDir), 0.0), 16.0);
                vec3 specular = specularStrength * spec * lightColor;  
                    
                vec3 result = ( specular + diffuse) * objectColor;
                gl_FragColor  = vec4(result, 1.0);
            } 
          `,
          uniforms: {
            lightColor: { value: new THREE.Color(0xffffff) },
            objectColor: { value: c },
          }
        });

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

  scrollToBottom();
}

const renderErrorMessage = (message, classes = ["error"]) => {

  const el = document.createElement("div");
  el.classList.add("message", ...classes);

  const ael = document.createElement("i");
  ael.classList.add("fa", "fa-warning");

  const bel = document.createElement("span");
  bel.innerText = message;

  el.appendChild(ael);
  el.appendChild(bel);
  $("#all-messages").appendChild(el);

  scrollToBottom();

}

const scrollToBottom = () => {
  const viewEl = $(".view");

  // If we are near the bottom
  if (viewEl.scrollHeight - viewEl.clientHeight - viewEl.scrollTop <= scrollDownThreshold) {
    // Scroll to the bottom
    viewEl.scrollTop = viewEl.scrollHeight;
  }
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
    const maxSignals = 2000;
    if (signals.length <= 2000) {
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
    if (message[imagePos + 1] != -14) {
      return false;
    }

    const finalIndex = message.indexOf(-15, imagePos + 2);
    if (finalIndex == -1) { // Mismatched brackets around image
      return false;
    }

    // Now we have the start and end of the "image", so we can check everything in between matches the pattern!
    let check = true;
    let current = imagePos + 2;
    let allSpheres = [];
    while (check) {
      let currentSphere = [];
      // If not followed by "sphere" then fail
      if (message[current++] != -52) {
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
        if (message[current++] < 0) {
          return false;
        }
        // Check for decimal
        if (message[current] == -10) { // Consumes decimal point
          current++;
          decimal = true;

          secondHalf = message[current];
          // Check next is positive as it is the next number after a decimal
          if (message[current++] < 0) {
            return false;
          }
        }

        // Treat negation and decimals
        if (decimal) {
          currentNumber = parseFloat(`${firstHalf}.${secondHalf}`);
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
      if (message[current] < 0 || message[current] > 64) {
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
// Code thanks to @elnico56 in discord!!!!
const COLORS = [
  "FF5800", "BBFF00",
  "00CDFF", "0084FF",
  "4D00FF", "FB39FF",
  "FF0FD7", "484848",
  "636363", "FFFFFF"
];

const calculateColor = (value) => {
  let n = value / 64 * (COLORS.length - 1);
  let lo = Math.floor(n);
  let hi = Math.ceil(n);
  let c = getGradientColor(COLORS[lo], COLORS[hi], n % 1)
  console.log("COLOUR " + c);
  return new THREE.Color(Number(c));
}

// Source - https://stackoverflow.com/a/27709336
// Posted by rjurado01, modified by community. See post 'Timeline' for change history
// Retrieved 2026-07-15, License - CC BY-SA 4.0
const getGradientColor = function (start_color, end_color, percent) {

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

const runWebSocket = (isReconnect) => {

  console.log("Opening websocket connection...")

  socket = new WebSocket(relayEndpoint);

  send = (msg) => {
    if (socket?.readyState === WebSocket.OPEN) {
      console.log(`SENDING: ${msg}`);
      socket.send(msg);
    }
    else {
      console.warn("Could not send message (socket is not open)");
    }
  }

  socket.addEventListener("open", () => {
    console.log("connected");
    retrying = false;

    if (isReconnect) {
      send(`S,${unconfirmedCallSign},0`);
    }
    else {
      send(`S,${unconfirmedCallSign}`);
    }

    // Prevent message-received sounds for the first 5 seconds
    receive_sounds_after = Date.now() + 5;
  })

  socket.onclose = function (e) {
    console.log('Socket is closed. Reconnect will be attempted in 5 seconds.', e.reason);
    if (!retrying) {
      renderErrorMessage("Lost connection to Relay. Retrying...");
    }
    retrying = true;
    setTimeout(function () {
      runWebSocket(true);
    }, 5000);
  };

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
          send(`S,${unconfirmedCallSign}`);
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
        const sequence = parseInt(content[2]);
        let message = content.slice(3).map(x => parseInt(x, 10));

        if (message[0] === SIGNAL_ENC) {
          // Encrypted message

          // Encryption key
          const k = message[1];
          message = message.slice(2);

          if (encryptionKeys.has(k) || encryptionKeys.has(SIGNAL_ENC_SKELETON)) {
            renderMessage(sender, sequence, message, k);
            if (sender !== callSign && Date.now() > receive_sounds_after) {
              play(snd_recv);
            }
          }
        }
        else {
          renderMessage(sender, sequence, message);

          if (sender !== callSign && Date.now() > receive_sounds_after) {
            play(snd_recv);
          }

        }

        break;
      case 'E':
        // Reconnection OK
        renderErrorMessage(`Reconnected to Relay`, ["good"]);

    }
  });
}

// Use tippy.js to add tooltips
const addTooltips = () => {
  const c = (sel, content) => tippy(sel, {
    content,
    animateFill: false,
    hideOnClick: false,
    duration: 0
  })
  c("#go-to-dsve", "Open Deep Space Visual Editor");
  c("#retheme", "Change Theme");
  c("#mute", "Mute/unmute");
  c("#toggle-expanded-format", "Toggle expanded format");
  c("#toggle-sidebar", "Toggle sidebar");
}

window.onload = () => {

  runWebSocket();

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
    send(`S,${unconfirmedCallSign}`);
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

        if (result[0] === SIGNAL_ENC_ENABLE) {
          if (result.length === 2) {
            enableEncryptionKey(result[1]);
            $("#message-input").value = "";
            play(snd_send);
          }
          else {
            renderErrorMessage("Exactly two signals required for this message");
          }
          // Do not send the message
          return;
        }

        else if (result[0] === SIGNAL_ENC_DISABLE) {
          if (result.length === 2) {
            disableEncryptionKey(result[1]);
            $("#message-input").value = "";
            play(snd_send);
          }
          else {
            renderErrorMessage("Exactly two signals required for this message");
          }
          // Do not send the message
          return;
        }

        else if (result[0] === SIGNAL_ENC) {
          // Requires at least 3 signals
          if (result.length < 3) {
            renderErrorMessage("Encrypted message requires at least 3 signals");
            return;
          }
          if (!(encryptionKeys.has(result[1]) || encryptionKeys.has(SIGNAL_ENC_SKELETON))) {
            renderErrorMessage(`Encryption key ${result[1]} is not enabled`);
            return;
          }
        }

        const msg = `M,${result.join(",")}`
        console.log("Sending: " + msg);
        send(msg);
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

  // Setup expanded format
  initialiseExpandedFormat();
  $("#toggle-expanded-format").addEventListener("click", () => {
    toggleExpandedFormat();
  })

  // Setup sidebar show/hide
  initialiseSidebar();
  $("#toggle-sidebar").addEventListener("click", () => {
    toggleSidebar();
  })

  // Setup encryption keys
  initialiseEncryptionKeys();

  // Setup clipboard

  $("#clipboard-zone").addEventListener("click", () => {
    const clipboardDialog = $("dialog.clipboard-paste");
    const clipboardTextArea = $("textarea.dict-paste-contents");
    clipboardTextArea.value = lastLoadedDict;
    clipboardDialog.showModal();
  });

  $("button.close-dialog").addEventListener("click", () => {
    const clipboardDialog = $("dialog.clipboard-paste");
    clipboardDialog.close();
  });

  $("button.save-dictionary").addEventListener("click", () => {
    const content = $("textarea.dict-paste-contents").value;
    if (!content) {
      console.warn("Could not retrieve contents from textarea");
      return;
    }

    const res = loadDictionary(content);

    if (res) {
      $("textarea.dict-paste-contents").value = "";
    }


    const clipboardDialog = $("dialog.clipboard-paste");
    clipboardDialog.close();
  });

  initialiseSenderIcons();
  $(".num-call-signs").addEventListener("click", () => {
    toggleSenderIcons();
  });

  addTooltips();
}



//************************************************//
// HELPERS


// From https://www.jameslmilner.com/posts/converting-rgb-hex-hsl-colors/
function hslToHex(h, s, l) {
  h /= 360;
  s /= 100;
  l /= 100;
  let r, g, b;
  if (s === 0) {
    r = g = b = l; // achromatic
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = x => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i); // Shift and combine
    hash |= 0; // Convert to 32-bit integer
  }
  return hash >>> 0; // Ensure the result is unsigned
}