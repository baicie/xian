import ExcelJS from 'exceljs'

export type ImportedTask = { title:string;description:string;kind:'TASK'|'STORY'|'BUG';priority:'HIGH'|'MEDIUM'|'LOW';sourceRow:number }
export type TaskWorkbookResult = { sheetName:string;headerRow:number;tasks:ImportedTask[];ignoredRows:number }

const normalize=(value:string)=>value.trim().toLowerCase().replace(/[\s_\-:：()（）]/g,'')
const titleHeaders=new Set(['模块','任务','任务标题','标题','工作内容','问题','事项','需求','issue','task'].map(normalize))
const sequenceHeaders=new Set(['序号','编号','no','number','#'].map(normalize))
const kindHeaders=new Set(['类型','任务类型','kind','type'].map(normalize))
const priorityHeaders=new Set(['优先级','优先程度','priority'].map(normalize))

function enumValue<T extends string>(value:string,values:Record<string,T>,fallback:T){return values[normalize(value)]??fallback}

export async function parseTaskWorkbook(data:Buffer):Promise<TaskWorkbookResult>{
  const workbook=new ExcelJS.Workbook()
  await workbook.xlsx.load(data as unknown as ExcelJS.Buffer)
  for(const sheet of workbook.worksheets){
    const maxHeaderRow=Math.min(sheet.rowCount,20)
    for(let rowNumber=1;rowNumber<=maxHeaderRow;rowNumber++){
      const row=sheet.getRow(rowNumber),headers:string[]=[]
      for(let column=1;column<=Math.min(sheet.columnCount,50);column++)headers.push(row.getCell(column).text.trim())
      const titleIndex=headers.findIndex(header=>titleHeaders.has(normalize(header)))
      if(titleIndex<0)continue
      const tasks:ImportedTask[]=[],lastRow=Math.min(sheet.rowCount,2001)
      let ignoredRows=0
      for(let sourceRow=rowNumber+1;sourceRow<=lastRow;sourceRow++){
        const values=headers.map((_,index)=>sheet.getRow(sourceRow).getCell(index+1).text.trim())
        const title=values[titleIndex]?.trim()??''
        if(!title){if(values.some(Boolean))ignoredRows++;continue}
        if(title.length>300)throw new Error(`第 ${sourceRow} 行任务标题超过 300 个字符`)
        const details:string[]=[]
        let kind:ImportedTask['kind']='TASK',priority:ImportedTask['priority']='MEDIUM'
        headers.forEach((header,index)=>{
          const key=normalize(header),value=values[index]
          if(!header||!value||index===titleIndex||sequenceHeaders.has(key))return
          if(kindHeaders.has(key)){kind=enumValue(value,{task:'TASK','任务':'TASK',story:'STORY','需求':'STORY',bug:'BUG','缺陷':'BUG','问题':'BUG'},'TASK');return}
          if(priorityHeaders.has(key)){priority=enumValue(value,{high:'HIGH','高':'HIGH','紧急':'HIGH',medium:'MEDIUM','中':'MEDIUM','普通':'MEDIUM',low:'LOW','低':'LOW'},'MEDIUM');return}
          details.push(`${header}：${value}`)
        })
        const description=details.join('\n')
        if(description.length>20000)throw new Error(`第 ${sourceRow} 行任务描述超过 20000 个字符`)
        tasks.push({title,description,kind,priority,sourceRow})
        if(tasks.length>500)throw new Error('单次最多导入 500 个任务')
      }
      if(!tasks.length)throw new Error(`工作表“${sheet.name}”未找到可导入的任务`)
      return{sheetName:sheet.name,headerRow:rowNumber,tasks,ignoredRows}
    }
  }
  throw new Error('未找到任务标题列，请使用“模块”“任务”或“标题”等表头')
}
