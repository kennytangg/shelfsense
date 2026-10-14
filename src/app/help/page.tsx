import Link from "next/link";
export default function Page() {
  return (
    <>
      <h1>Help</h1>
      <p>
        ShelfSense checks whether a shelf looks Full, Low, or Empty from a
        photo. You upload each check; it does not watch a live camera. This is
        one shared store workspace.
      </p>
      <ol className="help-steps">
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
          the same position and select <strong>Analyze photo</strong>.
        </li>
        <li>
          Read the result. <strong>Full</strong> means enough of the selected
          area looks occupied. <strong>Low</strong> means it needs replenishing.{" "}
          <strong>Empty</strong> means very little of the area looks occupied.
          Low and Empty create a restocking alert. These are estimates of
          visible coverage, not product counts.
        </li>
        <li>
          Open <Link href="/alerts">Alerts</Link> to find shelves needing
          restocking. Refill the shelf, select{" "}
          <strong>I've restocked this shelf</strong>, and submit another photo
          to verify it. Until then, the previous measured status remains
          visible.
        </li>
      </ol>
      <p>
        If a photo cannot be analyzed, follow the message and try another photo
        with matching framing and lighting. The previous valid result stays
        visible with its original check time. A shelf needing setup or its first
        check does not have a stock result yet.
      </p>
      <Link href="/">Back to shelves</Link>
    </>
  );
}
