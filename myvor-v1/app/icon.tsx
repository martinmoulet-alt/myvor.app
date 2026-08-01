import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",background:"#07162c",borderRadius:"22%"}}>
      <div style={{width:"72%",height:"72%",display:"flex",alignItems:"center",justifyContent:"center",background:"#d9a514",borderRadius:"24%",color:"#07162c",fontSize:260,fontWeight:900,fontFamily:"Arial, sans-serif"}}>M</div>
    </div>,
    size
  );
}
