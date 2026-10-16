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
          Open <Link href="/?view=restocking">Needs restocking</Link> to find
          shelves needing restocking. Refill the shelf, select{" "}
          <strong>Report restocked</strong>, and use{" "}
          <strong>Check stock</strong> with a new photo. A report records the
          staff action. A new Full result confirms recovery; a Low or Empty
          result puts the shelf back in Needs restocking.
        </li>
      </ol>
      <p>
        If a photo cannot be analyzed, follow the message and try another photo
        with matching framing and lighting. The previous valid result stays
        visible with its original check time. A shelf needing setup or its first
        check does not have a stock result yet.
      </p>
      <h2 className="text-lg font-bold leading-6">Use the shelf list</h2>
      <ul className="list-disc space-y-2 pl-7">
        <li>
          <Link href="/">All</Link> shows every shelf, including shelves that
          still need setup or their first check.
        </li>
        <li>
          <Link href="/?view=restocking">Needs restocking</Link> shows shelves
          with a Low or Empty alert. Open the shelf name to report it restocked
          after refilling.
        </li>
        <li>
          <Link href="/?view=verification">Restock reported</Link> shows shelves
          staff have refilled. Select Verify restock and upload a new photo to
          confirm the result.
        </li>
      </ul>
      <p>
        Full, Low and Empty describe the latest valid photo. They do not change
        when someone reports restocking. For example, a Low shelf stays Low with
        a Restock reported note until a new photo is checked. Open the shelf and
        select Check details to see when the photo was checked.
      </p>
      <h2 className="text-lg font-bold leading-6">If something goes wrong</h2>
      <p>
        If you see Needs setup, save an empty reference photo first. Not checked
        means the shelf needs its first valid photo check. Photo needs review
        means the latest attempt could not give a reliable result; open the
        shelf for the reason and retry. A failed check never confirms a refill
        or removes a restocking task.
      </p>
      <p>
        If the camera moves, open the shelf menu and repeat Set up shelf, then
        check a new photo. Use clear, evenly lit PNG or JPEG photos of the same
        shelf. Uploads must be at most 10 MiB and 20 million pixels.
      </p>
      <h2 className="text-lg font-bold leading-6">Manage or delete a shelf</h2>
      <p>
        Full cards have a green accent and need no restocking. Low cards have an
        amber accent; Empty cards have a red accent. Select Restock shelf to
        open the refill task, then Report restocked after refilling. Select
        Verify restock when a refill has been reported.
      </p>
      <p>
        Open a shelf by selecting its name, then select the trash icon and
        Delete shelf on its detail page. Read the confirmation and select Delete
        shelf to permanently remove that shelf, its photos, results and tasks.
        Select Cancel to keep it. Use the shelf’s three-dot menu to change
        setup.
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
