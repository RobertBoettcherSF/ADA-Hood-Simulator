package body Hood.Grid is

   procedure Fill (M : out Matrix; Blocks_X, Blocks_Y : Integer_32) is
      W : constant Integer_32 := Blocks_X * Cells_Per_Block;
      H : constant Integer_32 := Blocks_Y * Cells_Per_Block;
      XI, YI : Integer_32;
   begin
      for X in Cell_X loop
         for Y in Cell_Y loop
            XI := Integer_32 (X);
            YI := Integer_32 (Y);
            if XI < W and then YI < H
              and then Kind_In_Pitch (XI) = Block
              and then Kind_In_Pitch (YI) = Block
            then
               M (X, Y) := (Kind     => Block,
                            Block_Id => (YI / Cells_Per_Block) * Blocks_X
                                        + XI / Cells_Per_Block);
            else
               M (X, Y) := (Kind => Street, Block_Id => No_Block);
            end if;
         end loop;
      end loop;
   end Fill;

end Hood.Grid;
