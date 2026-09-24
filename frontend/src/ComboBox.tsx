import {useEffect, useId, useRef, useState} from 'react';

export type Choice = {key:string; label:string; detail?:string};
const normalize = (s:string) => s.toLocaleLowerCase().replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/ي/g,'ی').replace(/ك/g,'ک').replace(/\s+/g,' ').trim();

export function ComboBox({label, choices, value, onChange, disabled=false}: {
  label:string; choices:Choice[]; value:string; onChange:(key:string)=>void; disabled?:boolean;
}) {
  const id=useId(), root=useRef<HTMLDivElement>(null), input=useRef<HTMLInputElement>(null);
  const [open,setOpen]=useState(false), [query,setQuery]=useState(''), [active,setActive]=useState(0), [limit,setLimit]=useState(80);
  const selected=choices.find(c=>c.key===value);
  const matches=choices.filter(c=>normalize(c.label+' '+(c.detail||'')).includes(normalize(query)));
  const shown=matches.slice(0,limit);
  useEffect(()=>{if(open) input.current?.focus();},[open]);
  useEffect(()=>{const close=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false)};
    document.addEventListener('pointerdown',close); return ()=>document.removeEventListener('pointerdown',close);},[]);
  useEffect(()=>{if(open)document.getElementById(id+'item'+active)?.scrollIntoView({block:'nearest'});},[active,open,id]);
  function choose(key:string){onChange(key);setOpen(false);root.current?.querySelector<HTMLButtonElement>('button')?.focus();}
  return <div className="combobox" ref={root}>
    <span id={id+'label'} className="field-label">{label}</span>
    <button type="button" className="combo-trigger" aria-labelledby={id+'label'} aria-haspopup="listbox" aria-expanded={open}
      disabled={disabled} onClick={()=>{setOpen(!open);setQuery('');setActive(0);setLimit(80)}}>
      <span>{selected?.label || 'انتخاب کن…'}{selected?.detail && <small>{selected.detail}</small>}</span><span aria-hidden="true">⌄</span>
    </button>
    {open && <div className="combo-popover">
      <input ref={input} role="combobox" aria-label={'جست‌وجو در '+label} aria-expanded="true" aria-controls={id+'list'}
        aria-autocomplete="list" aria-activedescendant={shown[active]?id+'item'+active:undefined}
        placeholder="جست‌وجو در فهرست…" value={query} onChange={e=>{setQuery(e.target.value);setActive(0);setLimit(80)}}
        onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);root.current?.querySelector<HTMLButtonElement>('button')?.focus();e.preventDefault()}
          if(e.key==='ArrowDown'){setActive(Math.min(active+1,shown.length-1));e.preventDefault()}
          if(e.key==='ArrowUp'){setActive(Math.max(0,active-1));e.preventDefault()}
          if(e.key==='Enter'&&shown[active]){choose(shown[active].key);e.preventDefault()}}}/>
      <ul id={id+'list'} role="listbox" aria-labelledby={id+'label'}>
        {shown.map((c,i)=><li key={c.key} id={id+'item'+i} role="option" aria-selected={value===c.key}
          className={i===active?'active':''} onMouseDown={e=>e.preventDefault()} onMouseEnter={()=>setActive(i)} onClick={()=>choose(c.key)}>
          {c.label}{c.detail && <small>{c.detail}</small>}
        </li>)}
      </ul>
      {!shown.length && <p className="combo-empty">گزینه‌ای پیدا نشد.</p>}
      {matches.length>shown.length && <button type="button" className="combo-more" onClick={()=>setLimit(limit+80)}>نمایش گزینه‌های بیشتر ({matches.length.toLocaleString('fa-IR')})</button>}
    </div>}
  </div>;
}
