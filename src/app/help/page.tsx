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
      <h2 className="text-lg font-bold leading-6">Start with one shelf</h2>
      <p>
        Two kinds of photo are needed: a photo of the shelf while it is empty,
        taken once at setup, and a current photo for each check. At setup you
        can also add a photo of the shelf fully stocked; it is optional but
        recommended.
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
          You can also select <strong>Use entire image</strong>. If you have
          one, also add a photo of the shelf fully stocked.
        </li>
        <li>
          Select <strong>Check stock</strong>. Choose a current photo taken from
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
          Shelves needing restocking are counted on the{" "}
          <Link href="/alerts">Alerts</Link> menu item. Refill the shelf, select{" "}
          <strong>Report restocked</strong>, and use{" "}
          <strong>Check stock</strong> with a new photo. A report records the
          staff action. A new Full result confirms recovery; a Low or Empty
          result puts the shelf back in Alerts.
        </li>
      </ol>
      <h2 className="text-lg font-bold leading-6">If something goes wrong</h2>
      <p>
        If you see Needs setup, save an empty reference photo first. Not checked
        yet means the shelf needs its first valid photo check. Photo needs
        review means the latest attempt could not give a reliable result; open
        the shelf for the reason and retry. A failed check never confirms a
        refill or removes a restocking task. The previous valid result stays
        visible with its original check time.
      </p>
      <p>
        If the camera moves, open the shelf menu and repeat Set up shelf, then
        check a new photo. Use clear, evenly lit PNG or JPEG photos of the same
        shelf. Uploads must be at most 10 MiB and 20 million pixels.
      </p>
    </div>
  );
}
