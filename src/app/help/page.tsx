import Link from "next/link";
export default function Page() {
  return (
    <div className="space-y-6 text-base leading-6 [&_p]:font-serif [&_p]:leading-7 [&_ol]:font-serif [&_ol]:leading-7 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4">
      <h1 className="text-[1.75rem] leading-tight tracking-tight">Help</h1>
      <p>
        ShelfSense checks whether a shelf looks Full, Low, or Empty from a
        photo. You upload each check; it does not watch a live camera. This is
        one shared store workspace.
      </p>
      <ol className="list-decimal space-y-6 pl-7 [&_li]:pl-2">
        <li>
          Select <Link href="/shelves/new">Add shelf</Link>. Enter a shelf name
          and location so staff know where to go.
        </li>
        <li>
          <strong>Set up shelf</strong> with a photo of that shelf while it is
          empty. This gives the app a baseline. Select the shelf area, then
          select <strong>Save setup</strong>. Repeat setup if the camera
          position changes. Drag to select an area, or focus the image and use
          arrow keys to move the selection and Shift + arrow keys to resize it.
          You can also select <strong>Use entire image</strong>.
        </li>
        <li>
          Select <strong>Check shelf</strong>. Choose a current photo taken from
          the same position and select <strong>Check stock</strong>.
        </li>
        <li>
          Read the result. <strong>Full</strong> means enough of the selected
          area looks occupied. <strong>Low</strong> means it needs replenishing.{" "}
          <strong>Empty</strong> means very little of the area looks occupied.
          Low and Empty create a restocking alert. These are estimates of
          visible coverage, not product counts.
        </li>
        <li>
          Open <Link href="/?view=attention">Shelves needing attention</Link> to
          find shelves needing restocking. Refill the shelf, select{" "}
          <strong>Report restocked</strong>, and submit another photo to verify
          it. Until then, the previous measured status remains visible.
        </li>
      </ol>
      <p>
        If a photo cannot be analyzed, follow the message and try another photo
        with matching framing and lighting. The previous valid result stays
        visible with its original check time. A shelf needing setup or its first
        check does not have a stock result yet.
      </p>
      <h2 className="text-lg font-bold leading-6">About the photos</h2>
      <p>
        Alert photos show the latest valid check so staff can inspect the shelf
        before restocking. Shelves marked <strong>Sample shelf</strong> use
        generated test images. Your own shelves use the photos you upload.
      </p>
      <p>
        Real PNG and JPEG photos are supported. Use an empty reference and a
        current photo of the same shelf, with the same camera position and
        lighting. Unrelated stock photos cannot provide a reliable comparison;
        the app measures visual change rather than recognizing products.
      </p>
      <Link href="/">Back to shelves</Link>
    </div>
  );
}
