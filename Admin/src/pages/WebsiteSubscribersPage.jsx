import { useMemo } from 'react';
import { useWebsiteSubscribers,useWebsiteMutation } from '../api/website.js';
import DataTable from '../components/DataTable.jsx';
import WebsitePageHeader,{WebsiteError} from '../components/WebsitePageHeader.jsx';
import { LoadingState } from '../components/QueryState.jsx';
import { useToast } from '../components/Toast.jsx';
import { Icons } from '../icons.jsx';
export function subscriberCsv(rows) {
  const cell=value=>`"${String(value??'').replace(/^[=+@\-\t\r\n]/,"'$&").replaceAll('"','""')}"`;
  return [['Name','Email','Phone','Signed up','Status'],...rows.map(row=>[row.name,row.email,row.phone,row.date,row.status])].map(row=>row.map(cell).join(',')).join('\r\n');
}
export default function WebsiteSubscribersPage() {
  const query=useWebsiteSubscribers();const unsubscribe=useWebsiteMutation('unsubscribe','website-subscribers');const remove=useWebsiteMutation('delete-subscriber','website-subscribers');const toast=useToast();
  const rows=query.data?.subscribers||[];
  const columns=useMemo(()=>[
    {accessorKey:'name',header:'Name'},{accessorKey:'email',header:'Email'},{accessorKey:'phone',header:'Phone'},
    {accessorKey:'date',header:'Signed up',cell:info=>{const date=new Date(info.getValue());return Number.isNaN(date.getTime())?'—':date.toLocaleDateString();}},
    {accessorKey:'status',header:'Status',meta:{filterVariant:'select',options:[{value:'subscribed',label:'Subscribed'},{value:'unsubscribed',label:'Unsubscribed'}]},cell:info=><span className={`pp-badge ${info.getValue()==='subscribed'?'pp-badge-yes':'pp-badge-pending'}`}>{info.getValue()}</span>},
    {id:'actions',header:'Manage',cell:({row:{original:person}})=><div className="pp-action-cell">{person.status==='subscribed'&&<button className="pp-btn" disabled={unsubscribe.isPending} onClick={()=>{if(window.confirm(`Unsubscribe ${person.name} from website updates?`))unsubscribe.mutate({id:person.id,revision:person.revision},{onSuccess:()=>toast('Subscriber marked as unsubscribed'),onError:error=>toast(error.message,'error')});}}>Unsubscribe</button>}<button className="pp-btn pp-btn-delete" disabled={remove.isPending} onClick={()=>{if(window.confirm(`Permanently remove ${person.name} and their contact information from the signup register?`))remove.mutate({id:person.id,revision:person.revision},{onSuccess:()=>toast('Signup removed'),onError:error=>toast(error.message,'error')});}}>Remove</button></div>},
  ],[unsubscribe,remove,toast]);
  function download(){const url=URL.createObjectURL(new Blob(['\uFEFF'+subscriberCsv(rows.filter(row=>row.status==='subscribed'))],{type:'text/csv;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=`website-subscribers-${new Date().toISOString().slice(0,10)}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <div className="pp-page"><WebsitePageHeader title="Website signups" description="People who explicitly asked to receive website updates. This list is private to your team."><button className="pp-btn" onClick={download} disabled={!rows.some(row=>row.status==='subscribed')}><Icons.list size={15}/>Export subscribed CSV</button></WebsitePageHeader><WebsiteError query={query}/>{query.isLoading&&<LoadingState/>}{query.data&&<><div className="website-summary-strip"><span><strong>{rows.filter(row=>row.status==='subscribed').length}</strong> subscribed</span><span><strong>{rows.filter(row=>row.status==='unsubscribed').length}</strong> unsubscribed</span><span>Unsubscribed people are excluded from exports.</span><button className="pp-btn" disabled={query.isFetching} onClick={()=>query.refetch()}>Refresh</button></div><DataTable data={rows} columns={columns} getRowId={row=>row.id} emptyMessage="No website signups yet."/></>}</div>;
}
