import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from './ui/select'

type Option<T extends string>={value:T;label:string}

export default function ChoiceSelect<T extends string>({label,value,options,onChange,className,disabled=false}:{label:string;value:T;options:Option<T>[];onChange:(value:T)=>void;className?:string;disabled?:boolean}){
  return <Select items={options} value={value} disabled={disabled} onValueChange={next=>next&&onChange(next as T)}>
    <SelectTrigger aria-label={label} className={className}><SelectValue/></SelectTrigger>
    <SelectContent alignItemWithTrigger={false}><SelectGroup>{options.map(option=><SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectGroup></SelectContent>
  </Select>
}
