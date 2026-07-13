import type { Task } from './board'

const base='/api/v1'
let csrf=''
async function request<T>(path:string,init:RequestInit={}){const response=await fetch(base+path,{...init,credentials:'include',headers:{'content-type':'application/json',...(csrf?{'x-csrf-token':csrf}:{}),...init.headers}});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.message||'请求失败');return data as T}
export const api={
  async me(){const data=await request<{user:{id:string;name:string};csrfToken:string}>('/auth/me');csrf=data.csrfToken;return data},
  async login(email:string,password:string){const data=await request<{user:{id:string;name:string};csrfToken:string}>('/auth/login',{method:'POST',body:JSON.stringify({email,password})});csrf=data.csrfToken;return data},
  register(input:{email:string;name:string;password:string;workspaceName:string}){return request('/auth/register',{method:'POST',body:JSON.stringify(input)})},
  workspaces(){return request<{id:string;name:string;slug:string;role:string}[]>('/workspaces')},
  projects(workspaceId:string){return request<{id:string;name:string;code:string;color:string}[]>(`/workspaces/${workspaceId}/projects`)},
  createProject(workspaceId:string,input:{name:string;code:string}){return request(`/workspaces/${workspaceId}/projects`,{method:'POST',body:JSON.stringify({...input,description:'',color:'#2367d1'})})},
  columns(workspaceId:string,projectId:string){return request<{id:string;name:string;color:string}[]>(`/workspaces/${workspaceId}/projects/${projectId}/columns`)},
  async tasks(workspaceId:string,projectId:string,archived=false){const result=await request<{data:Array<{id:string;number:number;projectId:string;columnId:string;title:string;kind:Task['kind'];priority:'HIGH'|'MEDIUM'|'LOW';dueDate:string|null;version:number;assignees:{name:string}[]}>}>(`/workspaces/${workspaceId}/tasks?projectId=${projectId}&archived=${archived}`);return result.data.map((task):Task=>({id:task.id,number:task.number,projectId:task.projectId,title:task.title,kind:task.kind,column:task.columnId,priority:{HIGH:'高',MEDIUM:'中',LOW:'低'}[task.priority] as Task['priority'],assignee:task.assignees[0]?.name??'未分配',due:task.dueDate??'未设置',tags:[],version:task.version}))},
  members(workspaceId:string){return request<{id:string;name:string;email:string;role:string;disabledAt:string|null}[]>(`/workspaces/${workspaceId}/members`)},
  createTask(workspaceId:string,task:Task){return request(`/workspaces/${workspaceId}/tasks`,{method:'POST',body:JSON.stringify({projectId:task.projectId,columnId:task.column,title:task.title,description:'',kind:task.kind,priority:{高:'HIGH',中:'MEDIUM',低:'LOW'}[task.priority],assigneeIds:[],dueDate:null,labels:task.tags})})},
  updateTask(workspaceId:string,task:Task){return request<{id:string;version:number}>(`/workspaces/${workspaceId}/tasks/${task.id}`,{method:'PATCH',body:JSON.stringify({title:task.title,kind:task.kind,columnId:task.column,priority:{高:'HIGH',中:'MEDIUM',低:'LOW'}[task.priority],version:task.version})})},
}
