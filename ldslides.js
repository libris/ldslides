import * as transcribers from '//niklasl.github.io/ldtr/lib/transcribers.js'
import { visualize } from '//niklasl.github.io/ldtr/demo/visualizer.js'
import { renderArrows } from '//niklasl.github.io/ldtr/demo/arrows.js'

import { CONTEXT, GRAPH, ID, TYPE, VALUE, LANGUAGE, LIST } from '//niklasl.github.io/ldtr/lib/jsonld/keywords.js'

const PLAY_SYMBOL = '\u25B6'
const BACK_SYMBOL = '\u25C0\u25C0'
const SOURCE_SYMBOL = '\u{1F441}'

export class Steps {
  constructor (window) {
    this.steps = []
    this.i = 0
    this.data = null
    this.dataSnapshot = 'null'
    this.dataHistory = []

    window.onload = async () => {
      this.doc = window.document

      this.displayDiv = this.doc.createElement('div')
      this.displayDiv.classList.add('display')
      this.doc.body.appendChild(this.displayDiv)

      this.noteDiv = this.doc.createElement('div')
      this.noteDiv.classList.add('note')
      this.doc.body.appendChild(this.noteDiv)

      this.viewDiv = this.doc.createElement('section')
      this.doc.body.appendChild(this.viewDiv)

      this.nextBtn = this.doc.createElement('button')
      this.nextBtn.innerText = PLAY_SYMBOL
      this.nextBtn.addEventListener('click', evt => {
        this.nextStep()
      })
      this.nextBtn.classList.add('next')
      this.doc.body.appendChild(this.nextBtn)
      this.nextBtn.focus()

      this.setupViewSourceOverlay()

      this.nextStep()

      window.ldsteps = this
    }
  }

  setupViewSourceOverlay() {
    this.overlay = this.doc.createElement('div')
    this.overlay.classList.add('overlay')
    this.overlay.classList.add('hidden')
    this.doc.body.appendChild(this.overlay)

    this.code = this.doc.createElement('textarea')
    this.code.spellcheck = false
    this.code.classList.add('code')
    this.overlay.appendChild(this.code)

    const sourceBtn = this.doc.createElement('button')
    sourceBtn.classList.add('source')
    sourceBtn.innerText = SOURCE_SYMBOL
    sourceBtn.addEventListener('click', async evt => {
      if (this.overlay.classList.contains('hidden')) {
        await this.dumpTurtle()
        this.overlay.classList.remove('hidden')
      } else {
        this.overlay.classList.add('hidden')
      }
    })
    this.doc.body.appendChild(sourceBtn)
  }

  async dumpTurtle () {
    const serializer = await import('//niklasl.github.io/ldtr/lib/trig/serializer.js')
    if (!this.data) return

    let chunks = []
    serializer.serialize(this.data, {write (chunk) {chunks.push(chunk)}})
    let repr = chunks.join('')

    this.code.value = repr
  }

  nextStep () {
    if (this.done) {
      this.done = false
      this.i = 0
      this.dataSnapshot = 'null'
      this.dataHistory = []
      this.data = []
      this.viewDiv.innerHTML = ''
      this.displayDiv.innerHTML = ''
      this.nextBtn.innerText = PLAY_SYMBOL
      this.nextStep()
    } else if (this.i >= this.steps.length) {
      this.redraw()
      this.done = true
      this.nextBtn.innerText = BACK_SYMBOL
      this.nextBtn.blur()
    } else {
      this.steps[this.i++]()
    }
  }

  async drawSnapshot (snapshotData) {
    visualize(this.viewDiv, snapshotData)
    renderArrows(this.viewDiv)
  }

  async redraw () {
    if (this.data != null) {
      if (this.checkPrev()) {
        this.dataSnapshot = JSON.stringify(this.data)
      }

      visualize(this.viewDiv, this.data)
      renderArrows(this.viewDiv)
    }
  }

  async parse (data, type = 'text/turtle') {
    let url = null
    let transcribe = transcribers.transcribers[type]
    return transcribe({ data, type, base: url })
  }

  load (content) {
    this.steps.push(async () => {
      this.data = await this.parse(content)
      this.redraw()
    })
  }

  display (text, { incomplete = false, note } = {}) {
    this.steps.push(async () => {
      this.incomplete = incomplete
      let p = this.doc.createElement('p')
      p.innerHTML += `<label><input type=checkbox> ${text}</label>`
      this.displayDiv.appendChild(p)

      p.addEventListener('click', evt => {
        if (!p.classList.contains('complete')) {
          evt.stopPropagation()
          evt.preventDefault()
          const fwd = () => {
            this.nextStep()
            setTimeout(() => {
              if (this.incomplete) fwd()
              else this.nextStep()
            }, 100)
          }
          fwd()
        }
      })

      if (note != null) {
        this.noteDiv.innerHTML = note
        this.noteDiv.classList.add('showing')
      }
    })
  }

  complete () {
    this.steps.push(() => {
      this.incomplete = false
      this.nextStep()
    })
    return this
  }

  checkPrev () {
    if (this.incomplete) return false

    this.noteDiv.classList.remove('showing')
    let input = this.displayDiv.querySelector('p:last-of-type input[type=checkbox]')
    if (input) {
      input.checked = true
      let p = input.closest('p')
      if (p.classList.contains('complete')) return true
      p.classList.add('complete')

      const at = this.dataHistory.length
      this.dataHistory.push(JSON.parse(this.dataSnapshot))

      p.addEventListener('click', evt => {
        evt.stopPropagation()
        evt.preventDefault()
        if (input.checked) {
          checkInDirection(p, 'next', false)
          this.drawSnapshot(this.dataHistory[at])
        } else {
          checkInDirection(p, 'prev', true)
          this.drawSnapshot(at + 1 < this.dataHistory.length ?
                            this.dataHistory[at + 1] :
                            this.data)
        }
      })
    }

    return true
  }

  highlight (o, target=false) {
    if (o != null && typeof o == 'object') {
      for (o of Array.isArray(o) ? o : [o]) {
        if (ID in o) {
          let card = document.getElementById(o[ID])
          if (card) {
            card.classList.add(target ? 'target' : 'selected')
            if (target) {
              card.dispatchEvent(new MouseEvent('mouseover'))
            }
          }
        }
      }
    }
  }

  create (o) {
    this.steps.push(async () => {
      let data = typeof o === 'string' ? await this.parse(o) : o
      for (let item of data[GRAPH]) this.data[GRAPH].push(item)
      this.redraw()
      for (let item of data[GRAPH]) {
        if (GRAPH in item) for (let it of item[GRAPH]) this.highlight(it, true)
        else this.highlight(item, true)
      }
    })
  }

  extractAsLink (from, p, to) {
    this.steps.push(async () => {
      let o = null
      for (const item of this.data[GRAPH]) {
        if (item[ID] === from) {
          let { owner, key, object } = find(item, p)
          o = object
          o[ID] = to
          owner[key] = { [ID]: to }
          break
        }
      }
      if (o != null) {
        this.data[GRAPH].push(o)
      }
      this.redraw()
      this.highlight({[ID]: from})
      this.highlight(o, true)
    })
  }

  drop (from, p) {
    if (p == null) {
      this.steps.push(async () => {
        this.data[GRAPH] = this.data[GRAPH].filter(item => item[ID] !== from)
        this.redraw()
      })
    } else {
      this.replace(from, p)
    }
  }

  add (to, p, o, aslist = false) {
    this.steps.push(async () => {
      add(this.data[GRAPH], to, p, o, aslist)
      this.redraw()
      this.highlight(o, true)
      this.highlight({[ID]: to})
    })
  }

  replace (from, p, repl = null, p2 = null) {
    this.steps.push(async () => {
      replace(this.data[GRAPH], from, p, repl, p2)
      this.redraw()
      this.highlight({[ID]: from})
      this.highlight(repl, true)
    })
  }

  copy (from, p, to) {
    this.steps.push(async () => {
      let o = null
      let item
      for (item of this.data[GRAPH]) {
        if (item[ID] === from) {
          o = JSON.parse(JSON.stringify((item[p])))
          break
        }
      }
      if (o != null) {
        for (const item of this.data[GRAPH]) {
          if (item[ID] === to) {
            item[p] = o
            break
          }
        }
      }
      this.redraw()
      this.highlight({[ID]: to})
    })
  }

  move (from, p, to, p2 = p) {
    this.steps.push(async () => {
      let dropped = replace(this.data[GRAPH], from, p)
      add(this.data[GRAPH], to, p2, dropped)
      this.redraw()
      if (Array.isArray(p2) && p2[p2.length - 1] === ID) {
        this.highlight({[ID]: dropped}, true)
      } else {
        this.highlight({[ID]: to})
      }
    })
  }

  rename (s, p, p2) {
    this.steps.push(async () => {
      const item = lookup(this.data[GRAPH], s)
      let { owner, key, object } = find(item, p)
      replace(this.data[GRAPH], s, p, object, p2)
      this.redraw()
    })
  }
}

function lookup (graph, id) {
  for (const item of graph) {
    if (GRAPH in item) {
      const nested = lookup(item[GRAPH], id)
      if (nested != null) {
        return nested
      }
    }
    if (item[ID] === id) {
      return item
    }
  }
}

function find (item, p) {
  let owner = item
  let key = p
  let object = null
  if (Array.isArray(p)) {
    object = owner
    for (key of p) {
      owner = object
      object = owner[key]
    }
  } else {
    object = owner[p]
  }
  return { owner, key, object }
}

function checkInDirection (itemElement, dir, checked) {
  while (itemElement) {
    if (!itemElement.classList.contains('complete')) break

    let input = itemElement.querySelector('input[type=checkbox]')
    if (input) input.checked = checked
    else break

    itemElement = dir === 'next' ? itemElement.nextElementSibling : itemElement.previousElementSibling
  }
}

function add (graph, to, p, o, aslist = false) {
  const item = lookup(graph, to)
  let { owner, key, object } = find(item, p)
  if (aslist) {
    if (owner[key] == null) {
      owner[key] = []
    } else if (!Array.isArray(owner[key])) {
      owner[key] = [ owner[key] ]
    }
  }
  if (Array.isArray(owner[key])) {
    owner[key].push(o)
  } else {
    owner[key] = o
  }
}

function replace (graph, from, p, repl = null, p2 = null) {
  let dropped
  const item = lookup(graph, from)
  let { owner, key, object } = find(item, p)
  if (typeof key === 'string') {
    if (repl == null) {
      dropped = owner[key]
      delete owner[key]
    } else {
      if (p2) {
        const entries = Object.entries(owner)
        for (let k in owner) delete owner[k]
        for (let [k, v] of entries) {
          if (k === key) {
            owner[p2] = repl
          } else {
            owner[k] = v
          }
        }
      } else {
        owner[key] = repl
      }
    }
  } else {
    if (repl == null) {
      dropped = owner.splice(key, 1)
    } else {
      owner.splice(key, 1, repl)
    }
  }
  return dropped
}

export function ref (id) {
  return { ['@id']: id }
}
