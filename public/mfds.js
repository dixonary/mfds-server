// Global variables

let $ = (x) => document.querySelector(x);
let $$ = (x) => Array.from(document.querySelectorAll(x));

let unconfirmedCallSign = null;
let callSign = null;
let activeCallSigns = null;

let dictOrd = [];
let dict = {};

const snd_click = new Audio("sounds/click_ping.wav");
const snd_recv = new Audio("sounds/zap_down_quick.wav");
const snd_send = new Audio("sounds/zap_digi_up.wav");
// Only play receiving sounds after a certain time to avoid the history
// causing a big load to arrive at once
let receive_sounds_after = new Date();

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
  const data = JSON.parse(text);
  if (!data) {
    console.error("Could not read dictionary");
    return;
  }

  dictOrd = data.wordDict.keys.map((x, i) => {
    return {
      key: x,
      value: data.wordDict.values[i]
    };
  });
  descs = Object.fromEntries(data.descDict.keys.map((x, i) =>
    [x, data.descDict.values[i]]
  ));
  dictOrd = dictOrd.map(x => ({ ...x, desc: descs[x.key] }));

  updateDict();
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

  confirmBtn = $("#set-call-sign");
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

    const newText = str
      .map((x, i) => {
        if (x < 0) {
          entry = dict[x];
          if (entry) {
            let p = "";
            if (i > 0) {
              const prev = dict[str[i - 1]];
              if (entry.desc.formatMode > 0 || prev?.desc.formatModeAfter > 0) {
                p = `<span class="spacer"> </span>`;
              }
            }
            const s = `<span class="signal" title="SIGNAL ${x}">${entry.value}</span>`;
            return `${p}${s}`;
          }
          else {
            return `<span class="signal undef">@${x}_UNDEF</span>`;
          }
        }
        else {
          const prev = dict[str[i - 1]];
          console.log(x, prev?.desc)
          let p = "";
          if (prev?.desc.formatModeAfter > 0) {
            p = `<span class="spacer"> </span>`;
          }
          return `${p}<span class="signal number">${x}</span>`;
        }
      })
      .join("");

    console.log(newText);
    new Typewriter(el, {
      delay: 1,
      loop: false
    })
      .typeString(newText)
      .callFunction(({ elements: { cursor, wrapper } }) => {
        cursor.remove();
        wrapper.replaceWith(...wrapper.childNodes);
      })
      .start();

    el.setAttribute("data-status", "done");
    return el;
  })
}

const renderMessage = (sender, message) => {

  const el = document.createElement("div");
  el.classList.add("message");

  const ael = document.createElement("span");
  ael.classList.add("sender", "call-sign");
  ael.innerText = renderCallSign(sender);
  ael.style.color = getColor(sender);

  const bel = document.createElement("span");
  bel.classList.add("message-body", "do-translate");
  bel.setAttribute("data-original", JSON.stringify(message));

  el.appendChild(ael);
  el.appendChild(bel);
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

    // Try matching a nonnegative integer
    // ... in base 10 :(
    const numStr = text.slice(ix).match(/^\d+/)?.[0];
    if (numStr) {
      console.log(numStr);
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
    const maxSignals = 50;
    if (signals.length <= 50) {
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
    content = ev.data.split(",");
    console.log("RECEIVED: " + content);

    const msgType = content[0];
    switch (msgType) {
      case 'K':
        // Call sign OK
        const newCallSign = parseInt(content[1]);
        oldCallSign = callSign;
        console.log(`New call sign is ${newCallSign}`);
        callSign = newCallSign;
        setCallSign(newCallSign);
        localStorage.setItem("call-sign", newCallSign);

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
          snd_recv.play();
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
      snd_click.play();
    })
  });

  $$(".digit-dn").forEach(elem => {
    elem.addEventListener("click", () => {
      const val = getDigitValue(elem.parentNode);
      let newVal;
      if (val === 0) newVal = 7;
      else newVal = val - 1;
      setDigitValue(elem.parentNode, newVal);
      snd_click.play();
    })
  });

  $("#set-call-sign").addEventListener("click", () => {
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
      result = parseText(text);
      console.log(result);
      if (result) {
        const msg = `M,${result.join(",")}`
        console.log("Sending: " + msg);
        socket.send(msg);
        // Clear message
        $("#message-input").value = "";
        // Play sound
        snd_send.play();
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
}
