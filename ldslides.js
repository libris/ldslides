import * as transcribers from '//niklasl.github.io/ldtr/lib/transcribers.js'
import { visualize } from '//niklasl.github.io/ldtr/demo/visualizer.js'
import { renderArrows } from '//niklasl.github.io/ldtr/demo/arrows.js'

import { CONTEXT, GRAPH, ID, TYPE, VALUE, LANGUAGE, LIST } from '//niklasl.github.io/ldtr/lib/jsonld/keywords.js'

export class Steps {
  constructor (window) {
    this.steps = []
    this.i = 0
    this.data = null

    window.onload = async () => {
      this.doc = window.document
      this.nextBtn = this.doc.createElement('button')
      this.nextBtn.innerText = '>'
      this.nextBtn.addEventListener('click', evt => {
        this.nextStep()
      })
      this.doc.body.appendChild(this.nextBtn)

      this.displayDiv = this.doc.createElement('div')
      this.displayDiv.classList.add('display')
      this.doc.body.appendChild(this.displayDiv)

      this.viewDiv = this.doc.createElement('section')
      this.doc.body.appendChild(this.viewDiv)

      this.nextBtn.focus()
      this.nextStep()
    }
  }

  nextStep () {
    if (this.done) {
      this.done = false
      this.i = 0
      this.data = []
      this.viewDiv.innerHTML = ''
      this.displayDiv.innerHTML = ''
      this.nextBtn.innerText = '>'
      this.nextStep()
    } else if (this.i >= this.steps.length) {
      this.done = true
      this.nextBtn.innerText = '<<'
      this.nextBtn.blur()
    } else {
      this.steps[this.i++]()
    }
  }

  async redraw () {
    if (this.data != null) {
      this.checkPrev()
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

  display (text, { incomplete = false } = {}) {
    this.steps.push(async () => {
      this.incomplete = incomplete
      let p = this.doc.createElement('p')
      p.innerHTML += `<input type=checkbox> ${text}`
      this.displayDiv.appendChild(p)
    })
  }

  complete () {
    this.steps.push(async () => {
      this.incomplete = false
      this.nextStep()
    })
    return this
  }

  checkPrev () {
    if (this.incomplete) return

    let elem = this.displayDiv.querySelector('p:last-of-type > input[type=checkbox]')
    if (elem) {
      elem.checked = true
      elem.parentNode.classList.add('complete')
    }
  }

  create (o) {
    this.steps.push(async () => {
      let data = typeof o === 'string' ? await this.parse(o) : o
      for (let item of data[GRAPH]) this.data[GRAPH].push(item)
      this.redraw()
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

  add (from, p, o, aslist = false) {
    this.steps.push(async () => {
      for (const item of this.data[GRAPH]) {
        if (item[ID] === from) {
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
          break
        }
      }
      this.redraw()
    })
  }

  replace (from, p, repl = null) {
    this.steps.push(async () => {
      for (const item of this.data[GRAPH]) {
        if (item[ID] === from) {
          let { owner, key, object } = find(item, p)
          if (typeof key === 'string') {
            if (repl == null) {
              delete owner[key]
            } else {
              owner[key] = repl
            }
          } else {
            if (repl == null) {
              owner.splice(key, 1)
            } else {
              owner.splice(key, 1, repl)
            }
          }
          break
        }
      }
      this.redraw()
    })
  }

  copy (from, p, to) {
    this.steps.push(async () => {
      let o = null
      for (const item of this.data[GRAPH]) {
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
    })
  }

  move (from, p, to, p2 = p) {
    this.steps.push(async () => {
      let o = null
      for (const item of this.data[GRAPH]) {
        if (item[ID] === from) {
          o = item[p]
          delete item[p]
          break
        }
      }
      if (o != null) {
        for (const item of this.data[GRAPH]) {
          if (item[ID] === to) {
            item[p2] = o
            break
          }
        }
      }
      this.redraw()
    })
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
