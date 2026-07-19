import ExcelJS from 'exceljs'

export type ImportedTask = { title:string;description:string;kind:'TASK'|'STORY'|'BUG';priority:'HIGH'|'MEDIUM'|'LOW';sourceRow:number }
export type TaskColumnRole='TITLE'|'DESCRIPTION'|'KIND'|'PRIORITY'|'IGNORE'
export type TaskWorkbookMapping={titleColumn:number;descriptionColumns:number[];kindColumn:number|null;priorityColumn:number|null}
export type TaskWorkbookColumn={index:number;header:string;suggestedRole:TaskColumnRole}
export type TaskWorkbookRow=ImportedTask & {errors:string[];duplicateInFile:boolean}
export type TaskWorkbookAnalysis={sheetName:string;headerRow:number;columns:TaskWorkbookColumn[];mapping:TaskWorkbookMapping;rows:TaskWorkbookRow[];ignoredRows:number}
export type TaskWorkbookResult = { sheetName:string;headerRow:number;tasks:ImportedTask[];ignoredRows:number }

const normalize=(value:string)=>value.trim().toLowerCase().replace(/[\s_\-:：()（）]/g,'')
export const normalizeTaskTitle=normalize
const titleHeaders=new Set(['模块','任务','任务标题','标题','工作内容','问题','事项','需求','issue','task'].map(normalize))
const sequenceHeaders=new Set(['序号','编号','no','number','#'].map(normalize))
const kindHeaders=new Set(['类型','任务类型','kind','type'].map(normalize))
const priorityHeaders=new Set(['优先级','优先程度','priority'].map(normalize))

const enumValue=<T extends string>(value:string,values:Record<string,T>,fallback:T)=>values[normalize(value)]??fallback
const inRange=(value:number,length:number)=>Number.isInteger(value)&&value>=0&&value<length

function defaultMapping(headers:string[]):TaskWorkbookMapping{
  let titleColumn=headers.findIndex(header=>titleHeaders.has(normalize(header)))
  if(titleColumn<0)titleColumn=headers.findIndex(header=>header&&!sequenceHeaders.has(normalize(header)))
  const kindColumn=headers.findIndex(header=>kindHeaders.has(normalize(header))),priorityColumn=headers.findIndex(header=>priorityHeaders.has(normalize(header)))
  const descriptionColumns=headers.flatMap((header,index)=>header&&index!==titleColumn&&index!==kindColumn&&index!==priorityColumn&&!sequenceHeaders.has(normalize(header))?[index]:[])
  return{titleColumn,descriptionColumns,kindColumn:kindColumn<0?null:kindColumn,priorityColumn:priorityColumn<0?null:priorityColumn}
}

function validateMapping(mapping:TaskWorkbookMapping,length:number){
  if(!inRange(mapping.titleColumn,length))throw new Error('请选择任务标题列')
  const optional=[mapping.kindColumn,mapping.priorityColumn].filter((value):value is number=>value!==null)
  if([...mapping.descriptionColumns,...optional].some(value=>!inRange(value,length)))throw new Error('字段映射包含无效列')
  if(new Set([mapping.titleColumn,...mapping.descriptionColumns,...optional]).size!==1+mapping.descriptionColumns.length+optional.length)throw new Error('同一列不能映射到多个字段')
}

async function locateWorkbook(data:Buffer){
  const workbook=new ExcelJS.Workbook()
  await workbook.xlsx.load(data as unknown as ExcelJS.Buffer)
  let fallback:{sheet:ExcelJS.Worksheet;rowNumber:number;headers:string[];score:number}|null=null
  for(const sheet of workbook.worksheets){
    for(let rowNumber=1;rowNumber<=Math.min(sheet.rowCount,20);rowNumber++){
      const headers=Array.from({length:Math.min(sheet.columnCount,50)},(_,index)=>sheet.getRow(rowNumber).getCell(index+1).text.trim()),score=headers.filter(Boolean).length
      const hasTitle=headers.some(header=>titleHeaders.has(normalize(header))),hasStructure=headers.some(header=>{const key=normalize(header);return sequenceHeaders.has(key)||kindHeaders.has(key)||priorityHeaders.has(key)})
      if(hasTitle&&(hasStructure||score===1&&rowNumber===1))return{sheet,rowNumber,headers}
      if(score>=2&&(!fallback||score>fallback.score))fallback={sheet,rowNumber,headers,score}
    }
  }
  if(fallback)return{sheet:fallback.sheet,rowNumber:fallback.rowNumber,headers:fallback.headers}
  throw new Error('未找到可用的表头行')
}

export async function analyzeTaskWorkbook(data:Buffer,requestedMapping?:TaskWorkbookMapping):Promise<TaskWorkbookAnalysis>{
  const {sheet,rowNumber,headers}=await locateWorkbook(data),mapping=requestedMapping??defaultMapping(headers)
  validateMapping(mapping,headers.length)
  const columns=headers.map((header,index):TaskWorkbookColumn=>({index,header:header||`第 ${index+1} 列`,suggestedRole:index===mapping.titleColumn?'TITLE':mapping.descriptionColumns.includes(index)?'DESCRIPTION':index===mapping.kindColumn?'KIND':index===mapping.priorityColumn?'PRIORITY':'IGNORE'}))
  const rows:TaskWorkbookRow[]=[],seen=new Set<string>();let ignoredRows=0
  for(let sourceRow=rowNumber+1;sourceRow<=Math.min(sheet.rowCount,2001);sourceRow++){
    const values=headers.map((_,index)=>sheet.getRow(sourceRow).getCell(index+1).text.trim()),title=values[mapping.titleColumn]?.trim()??''
    const meaningful=values.some((value,index)=>value&&!sequenceHeaders.has(normalize(headers[index]??'')))
    if(!meaningful){if(values.some(Boolean))ignoredRows++;continue}
    const errors:string[]=[]
    if(!title)errors.push('缺少任务标题')
    if(title.length>300)errors.push('任务标题超过 300 个字符')
    const details=mapping.descriptionColumns.flatMap(index=>values[index]?[`${headers[index]||`第 ${index+1} 列`}：${values[index]}`]:[]),description=details.join('\n')
    if(description.length>20000)errors.push('任务描述超过 20000 个字符')
    const kind=mapping.kindColumn===null?'TASK':enumValue(values[mapping.kindColumn]??'',{task:'TASK','任务':'TASK',story:'STORY','需求':'STORY',bug:'BUG','缺陷':'BUG','问题':'BUG'},'TASK')
    const priority=mapping.priorityColumn===null?'MEDIUM':enumValue(values[mapping.priorityColumn]??'',{high:'HIGH','高':'HIGH','紧急':'HIGH',medium:'MEDIUM','中':'MEDIUM','普通':'MEDIUM',low:'LOW','低':'LOW'},'MEDIUM')
    const key=normalize(title),duplicateInFile=Boolean(key&&seen.has(key));if(key)seen.add(key)
    rows.push({title,description,kind,priority,sourceRow,errors,duplicateInFile})
    if(rows.length>500)throw new Error('单次最多导入 500 个任务')
  }
  return{sheetName:sheet.name,headerRow:rowNumber,columns,mapping,rows,ignoredRows}
}

export async function parseTaskWorkbook(data:Buffer,mapping?:TaskWorkbookMapping):Promise<TaskWorkbookResult>{
  const analysis=await analyzeTaskWorkbook(data,mapping),invalid=analysis.rows.find(row=>row.errors.length)
  if(invalid)throw new Error(`第 ${invalid.sourceRow} 行${invalid.errors[0]}`)
  if(!analysis.rows.length)throw new Error(`工作表“${analysis.sheetName}”未找到可导入的任务`)
  return{sheetName:analysis.sheetName,headerRow:analysis.headerRow,tasks:analysis.rows.map(({errors:_,duplicateInFile:__,...task})=>task),ignoredRows:analysis.ignoredRows}
}
