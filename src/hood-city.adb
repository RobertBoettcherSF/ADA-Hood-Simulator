with Hood.City.Standard;
with Hood.City.Varied;

package body Hood.City is

   Rank : array (Integer_32 range 0 .. Max_Buildings - 1) of Integer_32;
   --  Scratch for the hashes: a building's rank among the live ones.

   function To_Units (V : Long_Float) return Hood.Units.Units is
      S : constant Long_Float := V * 256.0;
      I : Integer_64 := Integer_64 (S);
   begin
      if Long_Float (I) > S then
         I := I - 1;
      end if;
      return Hood.Units.Units (I);
   end To_Units;

   procedure Count_Built (C : in out City_State) is
      Used : array (Hood.Tables.Type_Id) of Boolean := [others => False];
   begin
      C.Built_Class := [others => 0];
      C.Built_Types := 0;
      for I in 0 .. C.Building_Count - 1 loop
         if not C.Buildings (I).Removed then
            declare
               T : constant Hood.Tables.Type_Id := C.Buildings (I).Kind_Of;
               K : constant Hood.Tables.Building_Class := Hood.Tables.Type_Class (T);
            begin
               C.Built_Class (K) := C.Built_Class (K) + 1;
               if not Used (T) then
                  Used (T) := True;
                  C.Built_Types := C.Built_Types + 1;
               end if;
            end;
         end if;
      end loop;
   end Count_Built;

   procedure Generate
     (C      : out City_State;
      Main   : in out Hood.Random.Mulberry;
      Seed   : Unsigned_32;
      W, H   : Integer_32) is
   begin
      C.W := W;
      C.H := H;
      C.Standard := W = Standard_W and then H = Standard_H;
      C.Status := Status_Ok;
      C.Industrial_Edge := 0;
      C.Plan_Retries := 0;
      C.Block_Count := 0;
      C.Lot_Count := 0;
      C.Building_Count := 0;
      C.HQ_Count := 0;
      C.HQ := [others => (Block | Front | Front_As | FX | FY => No_Id)];
      C.City_Hash := 0;
      C.Structure_Hash := 0;
      --  citygen.ts:408: the industrial edge is drawn first on both paths.
      Hood.Random.Int (Main, 0, 3, C.Industrial_Edge);
      if C.Standard then
         Hood.City.Standard.Build (C, Main, Seed);
      else
         Hood.City.Varied.Build (C, Main, Seed);
      end if;
      C.Rng_After_City := Hood.Random.State (Main);
      C.City_Hash := City_Hash (C);
      C.Structure_Hash := Structure_Hash (C);
      Count_Built (C);
      if C.Standard and then C.Status = Status_Ok then
         Hood.City.Standard.Place_Headquarters (C, Seed);
      end if;
   end Generate;

   function Live_Buildings (C : City_State) return Integer_32 is
      N : Integer_32 := 0;
   begin
      for I in Integer_32 range 0 .. C.Building_Count - 1 loop
         if not C.Buildings (I).Removed then
            N := N + 1;
         end if;
      end loop;
      return N;
   end Live_Buildings;

   procedure Add (H : in out Unsigned_32; V : Integer_32) is
      U : constant Unsigned_32 := Unsigned_32 (Integer_64 (V) mod 2**32);
   begin
      for Byte in 0 .. 3 loop
         H := (H xor (Shift_Right (U, 8 * Byte) and 16#FF#)) * 16#0100_0193#;
      end loop;
   end Add;

   function Type_Number (T : Type_Id) return Integer_32 is
     (if T = Empty_Land then -1 else T);

   procedure Rank_Buildings (C : City_State) is
      N : Integer_32 := 0;
   begin
      for I in Integer_32 range 0 .. C.Building_Count - 1 loop
         if C.Buildings (I).Removed then
            Rank (I) := No_Id;
         else
            Rank (I) := N;
            N := N + 1;
         end if;
      end loop;
   end Rank_Buildings;

   function City_Hash (C : City_State) return Unsigned_32 is
      H : Unsigned_32 := 16#811C_9DC5#;
   begin
      for I in Integer_32 range 0 .. C.Block_Count - 1 loop
         declare
            B : Block_Rec renames C.Blocks (I);
         begin
            Add (H, B.GX);
            Add (H, B.GY);
            Add (H, District'Pos (B.Area));
            Add (H, B.Land_Value);
            Add (H, B.Squalor);
            Add (H, Block_Use'Pos (B.Use_Of));
            Add (H, B.Span_X);
            Add (H, B.Span_Y);
            Add (H, B.Merged_Into);
         end;
      end loop;
      Rank_Buildings (C);
      for I in Integer_32 range 0 .. C.Lot_Count - 1 loop
         declare
            L : Lot_Rec renames C.Lots (I);
         begin
            Add (H, L.Block);
            Add (H, L.Index);
            Add (H, Integer_32 (L.Center_X));
            Add (H, Integer_32 (L.Center_Y));
            Add (H, (if L.Building = No_Id then No_Id else Rank (L.Building)));
         end;
      end loop;
      for I in Integer_32 range 0 .. C.Building_Count - 1 loop
         if not C.Buildings (I).Removed then
            Add (H, C.Buildings (I).Lot);
            Add (H, C.Buildings (I).Block);
            Add (H, Type_Number (C.Buildings (I).Kind_Of));
         end if;
      end loop;
      return H;
   end City_Hash;

   function Structure_Hash (C : City_State) return Unsigned_32 is
      H : Unsigned_32 := 16#811C_9DC5#;
   begin
      for I in Integer_32 range 0 .. C.Block_Count - 1 loop
         declare
            B : Block_Rec renames C.Blocks (I);
         begin
            Add (H, B.GX);
            Add (H, B.GY);
            Add (H, District'Pos (B.Area));
            Add (H, B.Land_Value);
            Add (H, B.Squalor);
            Add (H, Block_Use'Pos (B.Use_Of));
            Add (H, B.Merged_Into);
         end;
      end loop;
      for I in Integer_32 range 0 .. C.Lot_Count - 1 loop
         Add (H, C.Lots (I).Block);
         Add (H, C.Lots (I).Index);
      end loop;
      for I in Integer_32 range 0 .. C.Building_Count - 1 loop
         if not C.Buildings (I).Removed then
            Add (H, C.Buildings (I).Block);
            Add (H, Type_Number (C.Buildings (I).Kind_Of));
         end if;
      end loop;
      return H;
   end Structure_Hash;

   procedure Add_Lot
     (C        : in out City_State;
      Block    : Integer_32;
      Index    : Integer_32;
      X, Y     : Long_Float;
      W, H     : Long_Float;
      Face     : Facing;
      Lot      : out Integer_32) is
   begin
      if C.Lot_Count = Max_Lots or else Block not in 0 .. C.Block_Count - 1 then
         C.Status := Status_Full;
         Lot := No_Id;
         return;
      end if;
      Lot := C.Lot_Count;
      C.Lot_Count := C.Lot_Count + 1;
      C.Lots (Lot) :=
        (Block    => Block,
         Index    => Index,
         X        => To_Units (X),
         Y        => To_Units (Y),
         W        => To_Units (W),
         H        => To_Units (H),
         Center_X => To_Units (X + W / 2.0),
         Center_Y => To_Units (Y + H / 2.0),
         Face     => Face,
         Building => No_Id);
      if C.Blocks (Block).Lots = 0 then
         C.Blocks (Block).First_Lot := Lot;
      end if;
      C.Blocks (Block).Lots := C.Blocks (Block).Lots + 1;
   end Add_Lot;

   procedure Add_Building
     (C       : in out City_State;
      Lot     : Integer_32;
      Kind_Of : Type_Id;
      Trade   : Integer_32;
      B       : out Integer_32) is
   begin
      if C.Building_Count = Max_Buildings or else Lot not in 0 .. C.Lot_Count - 1 then
         C.Status := Status_Full;
         B := No_Id;
         return;
      end if;
      B := C.Building_Count;
      C.Building_Count := C.Building_Count + 1;
      C.Buildings (B) :=
        (Lot => Lot, Block => C.Lots (Lot).Block, Kind_Of => Kind_Of,
         Trade => Trade, Removed => False);
      C.Lots (Lot).Building := B;
   end Add_Building;

   procedure Replace_Building
     (C       : in out City_State;
      Lot     : Integer_32;
      Kind_Of : Type_Id;
      B       : out Integer_32)
   is
      Old : constant Integer_32 :=
        (if Lot in 0 .. C.Lot_Count - 1 then C.Lots (Lot).Building else No_Id);
   begin
      if Old /= No_Id then
         C.Buildings (Old).Removed := True;
      end if;
      Add_Building (C, Lot, Kind_Of, Hood.Tables.No_Kind, B);
   end Replace_Building;

   procedure Starting_Sites
     (C     : City_State;
      Gang  : Integer_32;
      Taken : Building_Flags;
      Sites : out Starting_Site_List;
      Count : out Integer_32) is
   begin
      Hood.City.Standard.Starting_Sites (C, Gang, Taken, Sites, Count);
   end Starting_Sites;

end Hood.City;
