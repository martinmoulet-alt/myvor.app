"use client";

import React from "react";

type Props={name:string;children:React.ReactNode};
type State={failed:boolean;key:number};

export default class ModuleBoundary extends React.Component<Props,State>{
  state:State={failed:false,key:0};
  static getDerivedStateFromError(){return{failed:true};}
  componentDidCatch(error:unknown){console.error(`Myvor module failure: ${this.props.name}`,error);}
  retry=()=>this.setState(state=>({failed:false,key:state.key+1}));
  render(){
    if(this.state.failed)return <div style={{margin:18,padding:18,border:"1px solid #dbe5f1",borderRadius:14,background:"#f8fbff",color:"#17365f"}}><b>{this.props.name} reste disponible.</b><p style={{margin:"6px 0 12px",color:"#60738a"}}>Une erreur locale d’affichage a été isolée. Les autres modules continuent de fonctionner.</p><button type="button" onClick={this.retry} style={{border:"1px solid #cbd8e7",background:"white",borderRadius:9,padding:"8px 11px",fontWeight:800,color:"#17365f"}}>Recharger ce module</button></div>;
    return <React.Fragment key={this.state.key}>{this.props.children}</React.Fragment>;
  }
}
